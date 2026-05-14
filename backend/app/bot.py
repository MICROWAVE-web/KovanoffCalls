from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone

from aiogram import Bot, Dispatcher, F
from aiogram.filters import CommandObject, CommandStart
from aiogram.types import (
    Contact,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    KeyboardButtonRequestUsers,
    Message,
    ReplyKeyboardMarkup,
    UsersShared,
    WebAppInfo,
)
from redis.asyncio import Redis, from_url
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.config import get_settings
from app.db import SessionLocal
from app.models import User, UserSharedPeer
from app.notifications import NOTIFICATIONS_CHANNEL

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("bot")

REQUEST_USERS_ID = 1


def _add_contacts_keyboard() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[
            [
                KeyboardButton(
                    text="Choose people (Telegram)",
                    request_users=KeyboardButtonRequestUsers(
                        request_id=REQUEST_USERS_ID,
                        user_is_bot=False,
                        max_quantity=10,
                        request_name=True,
                        request_username=True,
                    ),
                )
            ],
            [KeyboardButton(text="Share phone contact", request_contact=True)],
        ],
        resize_keyboard=True,
        one_time_keyboard=False,
    )


async def _upsert_shared_peers(
    owner_id: int,
    rows: list[tuple[int, str | None, str | None, str | None]],
) -> None:
    now = datetime.now(timezone.utc)
    async with SessionLocal() as session:
        for peer_tid, fn, ln, un in rows:
            stmt = (
                pg_insert(UserSharedPeer)
                .values(
                    owner_user_id=owner_id,
                    peer_telegram_id=peer_tid,
                    first_name=fn,
                    last_name=ln,
                    username=un,
                    created_at=now,
                    updated_at=now,
                )
                .on_conflict_do_update(
                    index_elements=["owner_user_id", "peer_telegram_id"],
                    set_={
                        "first_name": fn,
                        "last_name": ln,
                        "username": un,
                        "updated_at": now,
                    },
                )
            )
            await session.execute(stmt)
        await session.commit()


async def _resolve_owner(telegram_user_id: int) -> User | None:
    async with SessionLocal() as session:
        return await session.scalar(select(User).where(User.telegram_id == telegram_user_id))


def build_dispatcher(webapp_url: str) -> Dispatcher:
    dp = Dispatcher()

    @dp.message(CommandStart())
    async def on_start(message: Message, command: CommandObject) -> None:
        reply_kb = ReplyKeyboardMarkup(
            keyboard=[
                [KeyboardButton(text="Open Calls", web_app=WebAppInfo(url=webapp_url))]
            ],
            resize_keyboard=True,
        )
        arg = (command.args or "").strip()
        if arg == "addcontacts":
            await message.answer(
                "Pick up to 10 people to add to your Calls directory, "
                "or share a phone contact if that person is on Telegram.",
                reply_markup=_add_contacts_keyboard(),
            )
            return
        await message.answer(
            "Welcome to Kovanoff Calls. Tap the button below to launch the app.",
            reply_markup=reply_kb,
        )

    @dp.message(F.users_shared)
    async def on_users_shared(message: Message) -> None:
        if message.from_user is None:
            return
        us: UsersShared | None = message.users_shared
        if us is None or not us.users:
            return
        owner = await _resolve_owner(message.from_user.id)
        if owner is None:
            await message.answer("Open the Calls mini app once to register, then try again.")
            return
        rows: list[tuple[int, str | None, str | None, str | None]] = []
        for su in us.users:
            rows.append((su.user_id, su.first_name, su.last_name, su.username))
        await _upsert_shared_peers(owner.id, rows)
        await message.answer(
            f"Saved {len(rows)} contact(s). Return to the mini app and refresh the list.",
            reply_markup=ReplyKeyboardMarkup(
                keyboard=[[KeyboardButton(text="Open Calls", web_app=WebAppInfo(url=webapp_url))]],
                resize_keyboard=True,
            ),
        )

    @dp.message(F.contact)
    async def on_contact_shared(message: Message) -> None:
        if message.from_user is None or message.contact is None:
            return
        c: Contact = message.contact
        if c.user_id is None:
            await message.answer(
                "This contact has no Telegram user id. Use “Choose people” to pick Telegram users."
            )
            return
        owner = await _resolve_owner(message.from_user.id)
        if owner is None:
            await message.answer("Open the Calls mini app once to register, then try again.")
            return
        await _upsert_shared_peers(
            owner.id,
            [(c.user_id, c.first_name, c.last_name, None)],
        )
        await message.answer(
            "Contact saved. Return to the mini app and refresh the list.",
            reply_markup=ReplyKeyboardMarkup(
                keyboard=[[KeyboardButton(text="Open Calls", web_app=WebAppInfo(url=webapp_url))]],
                resize_keyboard=True,
            ),
        )

    return dp


def _build_incoming_call_message(payload: dict, webapp_url: str) -> tuple[str, InlineKeyboardMarkup]:
    caller_name = payload.get("caller_name") or "Someone"
    target_url = payload.get("webapp_url") or webapp_url
    text = f"Incoming call from {caller_name}. Tap to answer."
    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="Answer", web_app=WebAppInfo(url=target_url))]
        ]
    )
    return text, kb


async def _notification_listener(bot: Bot, redis: Redis, webapp_url: str) -> None:
    pubsub = redis.pubsub()
    await pubsub.subscribe(NOTIFICATIONS_CHANNEL)
    logger.info("Subscribed to %s", NOTIFICATIONS_CHANNEL)
    try:
        async for message in pubsub.listen():
            if message.get("type") != "message":
                continue
            try:
                payload = json.loads(message["data"])
            except (TypeError, ValueError, json.JSONDecodeError):
                logger.warning("Invalid notification payload: %r", message.get("data"))
                continue

            if payload.get("type") != "incoming_call":
                continue
            tg_id = payload.get("callee_telegram_id")
            if not isinstance(tg_id, int):
                continue
            text, kb = _build_incoming_call_message(payload, webapp_url)
            try:
                await bot.send_message(tg_id, text, reply_markup=kb)
            except Exception as exc:
                logger.warning("Failed to send Telegram notification to %s: %s", tg_id, exc)
    finally:
        await pubsub.unsubscribe(NOTIFICATIONS_CHANNEL)
        await pubsub.aclose()


async def main() -> None:
    settings = get_settings()
    bot = Bot(token=settings.bot_token)
    dp = build_dispatcher(settings.webapp_url)
    redis: Redis = from_url(settings.redis_url, encoding="utf-8", decode_responses=True)

    listener = asyncio.create_task(_notification_listener(bot, redis, settings.webapp_url))
    try:
        await dp.start_polling(bot)
    finally:
        listener.cancel()
        try:
            await listener
        except asyncio.CancelledError:
            pass
        await redis.aclose()
        await bot.session.close()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        pass
