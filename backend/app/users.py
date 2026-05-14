from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import CurrentUser
from app.config import get_settings
from app.db import get_session
from app.models import User, UserSharedPeer
from app.redis_presence import get_presence
from app.schemas import ExternalPeer, OnlineUser, UserDirectoryResponse, UserPublic

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserPublic)
async def me(current: CurrentUser) -> UserPublic:
    return UserPublic.from_model(current)


@router.get("/online", response_model=list[OnlineUser])
async def online_users(
    current: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[OnlineUser]:
    presence = get_presence()
    online_ids = await presence.list_online()
    online_ids = [uid for uid in online_ids if uid != current.id]
    if not online_ids:
        return []
    rows = await session.scalars(select(User).where(User.id.in_(online_ids)))
    users = list(rows)
    return [
        OnlineUser(
            id=u.id,
            telegram_id=u.telegram_id,
            username=u.username,
            first_name=u.first_name,
            last_name=u.last_name,
            photo_url=u.photo_url,
            name=u.display_name,
            last_seen=u.last_seen,
        )
        for u in users
    ]


@router.get("/directory", response_model=UserDirectoryResponse)
async def user_directory(
    current: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> UserDirectoryResponse:
    presence = get_presence()
    online_ids = set(await presence.list_online())

    others = await session.scalars(select(User).where(User.id != current.id))
    other_users = list(others)

    online_out: list[OnlineUser] = []
    offline_out: list[OnlineUser] = []
    for u in other_users:
        dto = OnlineUser(
            id=u.id,
            telegram_id=u.telegram_id,
            username=u.username,
            first_name=u.first_name,
            last_name=u.last_name,
            photo_url=u.photo_url,
            name=u.display_name,
            last_seen=u.last_seen,
        )
        if u.id in online_ids:
            online_out.append(dto)
        else:
            offline_out.append(dto)

    online_out.sort(key=lambda x: x.name.lower())
    offline_out.sort(
        key=lambda x: x.last_seen.timestamp() if x.last_seen else 0.0,
        reverse=True,
    )

    reg_ids = select(User.telegram_id)
    ext_rows = await session.scalars(
        select(UserSharedPeer)
        .where(
            UserSharedPeer.owner_user_id == current.id,
            UserSharedPeer.peer_telegram_id != current.telegram_id,
            UserSharedPeer.peer_telegram_id.not_in(reg_ids),
        )
        .order_by(UserSharedPeer.updated_at.desc())
    )
    external = [ExternalPeer.from_row(r) for r in ext_rows]

    settings = get_settings()
    bot_u = settings.bot_username.strip() or None

    return UserDirectoryResponse(
        online=online_out,
        offline=offline_out,
        external=external,
        telegram_bot_username=bot_u,
    )


@router.get("/{user_id}", response_model=UserPublic)
async def get_user(
    user_id: int,
    _current: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> UserPublic:
    user = await session.scalar(select(User).where(User.id == user_id))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return UserPublic.from_model(user)
