from __future__ import annotations

import asyncio
import logging
import re
import uuid
from typing import Any

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status
from jwt import PyJWTError
from sqlalchemy import select

from app import calls as calls_service
from app.auth import decode_token
from app.config import get_settings
from app.db import SessionLocal
from app.models import Call, CallStatus, User
from app.notifications import NotificationPublisher
from app.redis_presence import get_presence
from app.schemas import UserPublic
from app.websocket_manager import manager

logger = logging.getLogger(__name__)


def _sdp_summary(sdp: Any) -> str:
    if isinstance(sdp, dict):
        text = str(sdp.get("sdp") or "")
        typ = str(sdp.get("type") or "?")
    elif isinstance(sdp, str):
        text = sdp
        typ = "?"
    else:
        return f"invalid_sdp_type={type(sdp).__name__}"
    m_lines = [ln for ln in text.splitlines() if ln.startswith("m=")][:6]
    return f"type={typ} bytes={len(text)} m_lines={m_lines!r}"


def _ice_summary(candidate: Any) -> str:
    if candidate is None:
        return "null"
    if not isinstance(candidate, dict):
        return f"non_dict={type(candidate).__name__}"
    c = candidate.get("candidate")
    if not c:
        return "end_of_candidates"
    m = re.search(r"typ (\S+)", str(c))
    typ = m.group(1) if m else "?"
    return f"typ={typ} chars={len(str(c))}"


router = APIRouter()


HEARTBEAT_INTERVAL = 25  # seconds


async def _authenticate(token: str) -> int | None:
    try:
        return decode_token(token)
    except Exception:
        return None


async def _load_user(user_id: int) -> User | None:
    async with SessionLocal() as session:
        return await session.scalar(select(User).where(User.id == user_id))


async def _send_error(ws: WebSocket, message: str, *, call_id: str | None = None) -> None:
    try:
        await ws.send_json(
            {"type": "error", "message": message, **({"call_id": call_id} if call_id else {})}
        )
    except Exception:
        pass


async def _presence_refresher(user_id: int) -> None:
    presence = get_presence()
    try:
        while True:
            await asyncio.sleep(HEARTBEAT_INTERVAL)
            await presence.refresh(user_id)
    except asyncio.CancelledError:
        return


async def _ring_timeout_watcher(call_id: uuid.UUID, callee_id: int, caller_id: int) -> None:
    settings = get_settings()
    try:
        await asyncio.sleep(settings.ring_timeout_seconds)
    except asyncio.CancelledError:
        return

    async with SessionLocal() as session:
        call = await calls_service.get_call(session, call_id)
        if call is None or call.status is not CallStatus.pending:
            return
        await calls_service.mark_missed(session, call)

    logger.info(
        "signaling ring_timeout call_id=%s callee_id=%s caller_id=%s -> missed",
        call_id,
        callee_id,
        caller_id,
    )
    await manager.send_to_user(
        caller_id,
        {"type": "call_missed", "call_id": str(call_id)},
    )
    await manager.send_to_user(
        callee_id,
        {"type": "call_cancelled", "call_id": str(call_id)},
    )


def _parse_call_id(raw: Any) -> uuid.UUID | None:
    if not isinstance(raw, str):
        return None
    try:
        return uuid.UUID(raw)
    except ValueError:
        return None


class CallSessionRegistry:
    """Tracks in-flight (pending/active) calls per user so we can clean up on disconnect."""

    def __init__(self) -> None:
        self._user_calls: dict[int, set[uuid.UUID]] = {}
        self._ring_tasks: dict[uuid.UUID, asyncio.Task[None]] = {}

    def add(self, user_id: int, call_id: uuid.UUID) -> None:
        self._user_calls.setdefault(user_id, set()).add(call_id)

    def remove(self, user_id: int, call_id: uuid.UUID) -> None:
        bucket = self._user_calls.get(user_id)
        if bucket:
            bucket.discard(call_id)
            if not bucket:
                self._user_calls.pop(user_id, None)

    def get_user_calls(self, user_id: int) -> list[uuid.UUID]:
        return list(self._user_calls.get(user_id, set()))

    def register_ring_task(self, call_id: uuid.UUID, task: asyncio.Task[None]) -> None:
        self._ring_tasks[call_id] = task

    def cancel_ring_task(self, call_id: uuid.UUID) -> None:
        task = self._ring_tasks.pop(call_id, None)
        if task is not None and not task.done():
            task.cancel()


sessions = CallSessionRegistry()


async def _replay_pending_incoming_for_callee(ws: WebSocket, callee_id: int) -> None:
    async with SessionLocal() as session:
        call = await calls_service.get_latest_pending_incoming_for_callee(session, callee_id)
        if call is None:
            return
        caller = call.caller
        invite_payload = {
            "type": "incoming_call",
            "call_id": str(call.id),
            "caller": UserPublic.from_model(caller).model_dump(),
        }
    try:
        await ws.send_json(invite_payload)
    except Exception:
        logger.exception("failed to replay pending incoming_call for user %s", callee_id)


async def _handle_call_invite(
    user: User,
    payload: dict[str, Any],
    ws: WebSocket,
    publisher: NotificationPublisher,
) -> None:
    target_user_id = payload.get("target_user_id")
    if not isinstance(target_user_id, int):
        await _send_error(ws, "target_user_id must be int")
        return
    if target_user_id == user.id:
        await _send_error(ws, "cannot call yourself")
        return

    async with SessionLocal() as session:
        target = await session.scalar(select(User).where(User.id == target_user_id))
        if target is None:
            await _send_error(ws, "target user not found")
            return
        call = await calls_service.create_pending_call(session, user.id, target.id)
        target_telegram_id = target.telegram_id

    sessions.add(user.id, call.id)
    sessions.add(target_user_id, call.id)

    invite_payload = {
        "type": "incoming_call",
        "call_id": str(call.id),
        "caller": UserPublic.from_model(user).model_dump(),
    }
    ack_payload = {
        "type": "call_invited",
        "call_id": str(call.id),
        "target_user_id": target_user_id,
    }

    delivered = await manager.send_to_user(target_user_id, invite_payload)
    await ws.send_json(ack_payload)

    logger.info(
        "signaling call_invite call_id=%s caller_id=%s callee_id=%s ws_delivered=%s",
        call.id,
        user.id,
        target_user_id,
        delivered,
    )

    if not delivered:
        try:
            caller_name = user.display_name
            await publisher.notify_incoming_call(
                callee_telegram_id=target_telegram_id,
                caller_name=caller_name,
                webapp_url=get_settings().webapp_url,
            )
        except Exception as exc:
            logger.warning("failed to publish offline notification: %s", exc)

    task = asyncio.create_task(_ring_timeout_watcher(call.id, target_user_id, user.id))
    sessions.register_ring_task(call.id, task)


async def _handle_call_accept(
    user: User, payload: dict[str, Any], ws: WebSocket
) -> None:
    call_id = _parse_call_id(payload.get("call_id"))
    if call_id is None:
        await _send_error(ws, "invalid call_id")
        return

    async with SessionLocal() as session:
        call = await calls_service.get_call(session, call_id)
        if call is None:
            await _send_error(ws, "call not found", call_id=str(call_id))
            return
        if call.callee_id != user.id:
            await _send_error(ws, "not allowed", call_id=str(call_id))
            return
        if call.status is not CallStatus.pending:
            await _send_error(ws, f"call not pending ({call.status.value})", call_id=str(call_id))
            return
        await calls_service.mark_active(session, call)
        caller_id = call.caller_id

    sessions.cancel_ring_task(call_id)

    forward = {"type": "call_accepted", "call_id": str(call_id), "by_user_id": user.id}
    await manager.send_to_user(caller_id, forward)
    await ws.send_json({"type": "call_active", "call_id": str(call_id), "peer_user_id": caller_id})
    logger.info(
        "signaling call_accept call_id=%s callee_id=%s caller_id=%s",
        call_id,
        user.id,
        caller_id,
    )


async def _handle_call_decline(
    user: User, payload: dict[str, Any], ws: WebSocket
) -> None:
    call_id = _parse_call_id(payload.get("call_id"))
    if call_id is None:
        await _send_error(ws, "invalid call_id")
        return

    async with SessionLocal() as session:
        call = await calls_service.get_call(session, call_id)
        if call is None or call.callee_id != user.id:
            await _send_error(ws, "call not found", call_id=str(call_id))
            return
        if call.status is not CallStatus.pending:
            await _send_error(ws, "call not pending", call_id=str(call_id))
            return
        await calls_service.mark_declined(session, call)
        caller_id = call.caller_id

    sessions.cancel_ring_task(call_id)
    sessions.remove(user.id, call_id)
    sessions.remove(caller_id, call_id)

    await manager.send_to_user(
        caller_id, {"type": "call_declined", "call_id": str(call_id), "by_user_id": user.id}
    )
    logger.info(
        "signaling call_decline call_id=%s callee_id=%s caller_id=%s",
        call_id,
        user.id,
        caller_id,
    )


async def _handle_relay(
    user: User,
    payload: dict[str, Any],
    ws: WebSocket,
    msg_type: str,
) -> None:
    call_id = _parse_call_id(payload.get("call_id"))
    if call_id is None:
        await _send_error(ws, "invalid call_id")
        return

    async with SessionLocal() as session:
        call = await calls_service.get_call(session, call_id)
        if call is None:
            await _send_error(ws, "call not found", call_id=str(call_id))
            return
        if user.id not in (call.caller_id, call.callee_id):
            await _send_error(ws, "not a participant", call_id=str(call_id))
            return
        peer_id = call.callee_id if user.id == call.caller_id else call.caller_id

    forward: dict[str, Any] = {"type": msg_type, "call_id": str(call_id)}
    if msg_type in ("offer", "answer"):
        sdp = payload.get("sdp")
        if not isinstance(sdp, (str, dict)):
            await _send_error(ws, f"invalid sdp for {msg_type}", call_id=str(call_id))
            return
        forward["sdp"] = sdp
    elif msg_type == "ice_candidate":
        forward["candidate"] = payload.get("candidate")

    delivered = await manager.send_to_user(peer_id, forward)
    if msg_type == "ice_candidate":
        logger.info(
            "signaling relay ice_candidate call_id=%s from_user=%s to_peer=%s %s delivered=%s",
            call_id,
            user.id,
            peer_id,
            _ice_summary(forward.get("candidate")),
            delivered,
        )
    elif msg_type in ("offer", "answer"):
        logger.info(
            "signaling relay %s call_id=%s from_user=%s to_peer=%s %s delivered=%s",
            msg_type,
            call_id,
            user.id,
            peer_id,
            _sdp_summary(forward.get("sdp")),
            delivered,
        )
    if not delivered:
        logger.warning(
            "signaling relay UNDELIVERED type=%s call_id=%s from_user=%s peer_id=%s",
            msg_type,
            call_id,
            user.id,
            peer_id,
        )
        await _send_error(ws, "peer not reachable", call_id=str(call_id))


async def _handle_call_end(
    user: User, payload: dict[str, Any], ws: WebSocket
) -> None:
    call_id = _parse_call_id(payload.get("call_id"))
    if call_id is None:
        await _send_error(ws, "invalid call_id")
        return

    raw_reason = payload.get("reason")
    client_reason: str | None = None
    if isinstance(raw_reason, str):
        s = raw_reason.strip()
        if s:
            client_reason = s[:200]

    async with SessionLocal() as session:
        call = await calls_service.get_call(session, call_id)
        if call is None:
            return
        if user.id not in (call.caller_id, call.callee_id):
            await _send_error(ws, "not a participant", call_id=str(call_id))
            return
        if call.status in (CallStatus.ended, CallStatus.declined, CallStatus.missed):
            return
        await calls_service.mark_ended(session, call)
        peer_id = call.callee_id if user.id == call.caller_id else call.caller_id

    sessions.cancel_ring_task(call_id)
    sessions.remove(user.id, call_id)
    sessions.remove(peer_id, call_id)

    peer_msg: dict[str, Any] = {
        "type": "call_ended",
        "call_id": str(call_id),
        "by_user_id": user.id,
    }
    if client_reason:
        peer_msg["reason"] = client_reason

    await manager.send_to_user(peer_id, peer_msg)
    logger.info(
        "signaling call_end call_id=%s ended_by_user=%s peer_id=%s client_reason=%s",
        call_id,
        user.id,
        peer_id,
        client_reason or "-",
    )


async def _cleanup_user_calls(user_id: int) -> None:
    """End any pending/active calls the user participates in (e.g. abrupt disconnect)."""
    for call_id in sessions.get_user_calls(user_id):
        async with SessionLocal() as session:
            call = await calls_service.get_call(session, call_id)
            if call is None:
                sessions.remove(user_id, call_id)
                continue
            if call.status in (CallStatus.ended, CallStatus.declined, CallStatus.missed):
                sessions.remove(user_id, call_id)
                continue

            peer_id = call.callee_id if user_id == call.caller_id else call.caller_id
            if call.status is CallStatus.pending:
                await calls_service.mark_missed(session, call)
                peer_msg = {"type": "call_cancelled", "call_id": str(call_id)}
                action = "call_cancelled_pending"
            else:
                await calls_service.mark_ended(session, call)
                peer_msg = {
                    "type": "call_ended",
                    "call_id": str(call_id),
                    "by_user_id": user_id,
                    "reason": "peer_disconnected",
                }
                action = "call_ended_peer_disconnected"

        sessions.cancel_ring_task(call_id)
        sessions.remove(user_id, call_id)
        sessions.remove(peer_id, call_id)
        logger.info(
            "signaling cleanup_call disconnected_user=%s call_id=%s peer_id=%s action=%s peer_msg=%s",
            user_id,
            call_id,
            peer_id,
            action,
            peer_msg,
        )
        await manager.send_to_user(peer_id, peer_msg)


async def _broadcast_presence(user: User, *, online: bool) -> None:
    payload = {
        "type": "presence",
        "user_id": user.id,
        "online": online,
    }
    if online:
        payload["user"] = UserPublic.from_model(user).model_dump()
    presence = get_presence()
    for uid in await presence.list_online():
        if uid == user.id:
            continue
        await manager.send_to_user(uid, payload)


@router.websocket("/ws")
async def signaling_endpoint(websocket: WebSocket, token: str = Query(...)) -> None:
    user_id = await _authenticate(token)
    if user_id is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    user = await _load_user(user_id)
    if user is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()

    previous = await manager.connect(user.id, websocket)
    if previous is not None:
        try:
            await previous.close(code=status.WS_1000_NORMAL_CLOSURE)
        except Exception:
            pass

    presence = get_presence()
    await presence.mark_online(user.id)
    refresher = asyncio.create_task(_presence_refresher(user.id))

    publisher = NotificationPublisher(presence.redis)

    logger.info("signaling ws accepted user_id=%s sending hello", user.id)

    await websocket.send_json(
        {"type": "hello", "user": UserPublic.from_model(user).model_dump()}
    )
    await _replay_pending_incoming_for_callee(websocket, user.id)
    await _broadcast_presence(user, online=True)

    try:
        while True:
            payload = await websocket.receive_json()
            if not isinstance(payload, dict):
                await _send_error(websocket, "payload must be an object")
                continue
            msg_type = payload.get("type")

            if msg_type != "ping":
                logger.info("signaling recv user_id=%s type=%s", user.id, msg_type)

            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})
            elif msg_type == "call_invite":
                await _handle_call_invite(user, payload, websocket, publisher)
            elif msg_type == "call_accept":
                await _handle_call_accept(user, payload, websocket)
            elif msg_type == "call_decline":
                await _handle_call_decline(user, payload, websocket)
            elif msg_type in ("offer", "answer", "ice_candidate"):
                await _handle_relay(user, payload, websocket, msg_type)
            elif msg_type == "call_end":
                await _handle_call_end(user, payload, websocket)
            else:
                await _send_error(websocket, f"unknown type: {msg_type}")
    except WebSocketDisconnect:
        logger.info("signaling WebSocketDisconnect user_id=%s", user.id)
    except Exception as exc:
        logger.exception("signaling error for user %s: %s", user.id, exc)
    finally:
        refresher.cancel()
        was_active = await manager.disconnect(user.id, websocket)
        logger.info(
            "signaling ws teardown user_id=%s was_active_connection=%s",
            user.id,
            was_active,
        )
        if was_active:
            # We were the user's current connection — do the real teardown.
            await presence.mark_offline(user.id)
            await _cleanup_user_calls(user.id)
            await _broadcast_presence(user, online=False)
        else:
            # A newer WS replaced us (reconnect). Do nothing — the new
            # connection owns the user's presence and active calls.
            logger.info(
                "WS for user %s superseded by newer connection; skipping cleanup",
                user.id,
            )
