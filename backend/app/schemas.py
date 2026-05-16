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


class ExternalPeer(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    telegram_id: int
    username: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    name: str = Field(default="")

    @classmethod
    def from_row(cls, row: object) -> "ExternalPeer":
        return cls(
            telegram_id=getattr(row, "peer_telegram_id"),
            username=getattr(row, "username"),
            first_name=getattr(row, "first_name"),
            last_name=getattr(row, "last_name"),
            name=getattr(row, "display_name"),
        )


class UserDirectoryResponse(BaseModel):
    online: list[OnlineUser]
    offline: list[OnlineUser]
    external: list[ExternalPeer]
    telegram_bot_username: str | None = None


class FriendRequestPublic(BaseModel):
    id: int
    from_user: UserPublic
    created_at: datetime


class FriendsDirectoryResponse(BaseModel):
    online: list[OnlineUser]
    offline: list[OnlineUser]
    external: list[ExternalPeer]
    incoming_requests: list[FriendRequestPublic]
    telegram_bot_username: str | None = None


class FriendRequestCreate(BaseModel):
    user_id: int


class FriendRequestActionResponse(BaseModel):
    id: int
    status: str
    from_user_id: int
    to_user_id: int


class UserSearchResult(UserPublic):
    relation: str = Field(
        description="none | friend | pending_out | pending_in",
    )


class UserSearchResponse(BaseModel):
    results: list[UserSearchResult]


class TelegramAuthRequest(BaseModel):
    initData: str


class TelegramAuthResponse(BaseModel):
    access_token: str
    user: UserPublic
