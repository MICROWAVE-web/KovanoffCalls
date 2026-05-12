from __future__ import annotations

import json
from typing import Any

from redis.asyncio import Redis

NOTIFICATIONS_CHANNEL = "bot:notifications"


class NotificationPublisher:
    """Publishes offline call notifications to the bot service via Redis pub/sub."""

    def __init__(self, redis: Redis) -> None:
        self._redis = redis

    async def notify_incoming_call(
        self,
        callee_telegram_id: int,
        caller_name: str,
        webapp_url: str | None = None,
    ) -> None:
        payload: dict[str, Any] = {
            "type": "incoming_call",
            "callee_telegram_id": callee_telegram_id,
            "caller_name": caller_name,
        }
        if webapp_url:
            payload["webapp_url"] = webapp_url
        await self._redis.publish(NOTIFICATIONS_CHANNEL, json.dumps(payload))
