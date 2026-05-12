from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class UserPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    telegram_id: int
    username: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    photo_url: str | None = None
    name: str = Field(default="")

    @classmethod
    def from_model(cls, user: object) -> "UserPublic":
        return cls(
            id=getattr(user, "id"),
            telegram_id=getattr(user, "telegram_id"),
            username=getattr(user, "username"),
            first_name=getattr(user, "first_name"),
            last_name=getattr(user, "last_name"),
            photo_url=getattr(user, "photo_url"),
            name=getattr(user, "display_name"),
        )


class OnlineUser(UserPublic):
    last_seen: datetime | None = None


class TelegramAuthRequest(BaseModel):
    initData: str


class TelegramAuthResponse(BaseModel):
    access_token: str
    user: UserPublic
