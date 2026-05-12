from __future__ import annotations

from redis.asyncio import Redis, from_url

from app.config import get_settings

PRESENCE_PREFIX = "presence:user:"


class PresenceService:
    def __init__(self, redis: Redis, ttl_seconds: int) -> None:
        self._redis = redis
        self._ttl = ttl_seconds

    @property
    def redis(self) -> Redis:
        return self._redis

    @staticmethod
    def _key(user_id: int) -> str:
        return f"{PRESENCE_PREFIX}{user_id}"

    async def mark_online(self, user_id: int) -> None:
        await self._redis.set(self._key(user_id), "1", ex=self._ttl)

    async def refresh(self, user_id: int) -> None:
        await self._redis.expire(self._key(user_id), self._ttl)

    async def mark_offline(self, user_id: int) -> None:
        await self._redis.delete(self._key(user_id))

    async def is_online(self, user_id: int) -> bool:
        return await self._redis.exists(self._key(user_id)) > 0

    async def list_online(self) -> list[int]:
        ids: list[int] = []
        async for key in self._redis.scan_iter(match=f"{PRESENCE_PREFIX}*", count=200):
            try:
                ids.append(int(key.split(PRESENCE_PREFIX, 1)[1]))
            except (IndexError, ValueError):
                continue
        return ids


_presence: PresenceService | None = None


async def init_presence() -> PresenceService:
    global _presence
    settings = get_settings()
    redis: Redis = from_url(settings.redis_url, encoding="utf-8", decode_responses=True)
    _presence = PresenceService(redis, settings.presence_ttl_seconds)
    return _presence


def get_presence() -> PresenceService:
    if _presence is None:
        raise RuntimeError("Presence service not initialized")
    return _presence


async def close_presence() -> None:
    global _presence
    if _presence is not None:
        await _presence.redis.aclose()
        _presence = None
