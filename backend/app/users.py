from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import CurrentUser
from app.db import get_session
from app.models import User
from app.redis_presence import get_presence
from app.schemas import OnlineUser, UserPublic

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
