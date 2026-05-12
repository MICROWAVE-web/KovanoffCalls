from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class WebSocketManager:
    """Single-instance in-memory mapping user_id -> WebSocket connection."""

    def __init__(self) -> None:
        self._connections: dict[int, WebSocket] = {}
        self._lock = asyncio.Lock()

    async def connect(self, user_id: int, websocket: WebSocket) -> WebSocket | None:
        """Register a connection. If the user already had one, returns the previous socket so
        the caller can close it (one active session per user)."""
        async with self._lock:
            previous = self._connections.get(user_id)
            self._connections[user_id] = websocket
        return previous

    async def disconnect(self, user_id: int, websocket: WebSocket) -> None:
        async with self._lock:
            current = self._connections.get(user_id)
            if current is websocket:
                self._connections.pop(user_id, None)

    def is_connected(self, user_id: int) -> bool:
        return user_id in self._connections

    def get(self, user_id: int) -> WebSocket | None:
        return self._connections.get(user_id)

    async def send_to_user(self, user_id: int, payload: dict[str, Any]) -> bool:
        ws = self._connections.get(user_id)
        if ws is None:
            return False
        try:
            await ws.send_json(payload)
            return True
        except Exception as exc:  # connection torn down between check and send
            logger.warning("send_to_user(%s) failed: %s", user_id, exc)
            return False


manager = WebSocketManager()
