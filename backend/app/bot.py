from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from aiogram import Bot, Dispatcher
from aiogram.filters import CommandStart
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    Message,
    ReplyKeyboardMarkup,
    WebAppInfo,
)
from redis.asyncio import Redis, from_url

from app.config import get_settings
from app.notifications import NOTIFICATIONS_CHANNEL

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("bot")


def build_dispatcher(webapp_url: str) -> Dispatcher:
    dp = Dispatcher()

    @dp.message(CommandStart())
    async def on_start(message: Message) -> None:
        reply_kb = ReplyKeyboardMarkup(
            keyboard=[
                [KeyboardButton(text="Open Calls", web_app=WebAppInfo(url=webapp_url))]
            ],
            resize_keyboard=True,
        )
        await message.answer(
            "Welcome to Kovanoff Calls. Tap the button below to launch the app.",
            reply_markup=reply_kb,
        )

    return dp


def _build_incoming_call_message(payload: dict[str, Any], webapp_url: str) -> tuple[str, InlineKeyboardMarkup]:
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
