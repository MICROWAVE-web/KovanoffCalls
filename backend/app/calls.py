from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Call, CallMediaMode, CallStatus


async def create_pending_call(
    session: AsyncSession,
    caller_id: int,
    callee_id: int,
    *,
    media_mode: CallMediaMode = CallMediaMode.video,
) -> Call:
    call = Call(
        id=uuid.uuid4(),
        caller_id=caller_id,
        callee_id=callee_id,
        status=CallStatus.pending,
        media_mode=media_mode,
    )
    session.add(call)
    await session.commit()
    await session.refresh(call)
    return call


async def get_call(session: AsyncSession, call_id: uuid.UUID) -> Call | None:
    return await session.scalar(select(Call).where(Call.id == call_id))


async def get_latest_pending_incoming_for_callee(
    session: AsyncSession, callee_id: int
) -> Call | None:
    """Most recent pending call where this user is the callee (e.g. missed WS delivery)."""
    stmt = (
        select(Call)
        .where(Call.callee_id == callee_id, Call.status == CallStatus.pending)
        .order_by(Call.created_at.desc())
        .limit(1)
    )
    return await session.scalar(stmt)


async def mark_active(session: AsyncSession, call: Call) -> Call:
    call.status = CallStatus.active
    call.started_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(call)
    return call


async def mark_declined(session: AsyncSession, call: Call) -> Call:
    call.status = CallStatus.declined
    call.ended_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(call)
    return call


async def mark_missed(session: AsyncSession, call: Call) -> Call:
    call.status = CallStatus.missed
    call.ended_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(call)
    return call


async def mark_ended(session: AsyncSession, call: Call) -> Call:
    now = datetime.now(timezone.utc)
    call.status = CallStatus.ended
    call.ended_at = now
    if call.started_at is not None:
        call.duration_seconds = max(0, int((now - call.started_at).total_seconds()))
    else:
        call.duration_seconds = 0
    await session.commit()
    await session.refresh(call)
    return call
