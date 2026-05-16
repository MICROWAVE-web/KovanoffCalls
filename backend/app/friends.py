from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import CurrentUser
from app.config import get_settings
from app.db import get_session
from app import friends_service
from app.models import User, UserSharedPeer
from app.redis_presence import get_presence
from app.schemas import (
    ExternalPeer,
    FriendRequestActionResponse,
    FriendRequestCreate,
    FriendRequestPublic,
    FriendsDirectoryResponse,
    OnlineUser,
    UserPublic,
)

router = APIRouter(prefix="/friends", tags=["friends"])


@router.get("/directory", response_model=FriendsDirectoryResponse)
async def friends_directory(
    current: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> FriendsDirectoryResponse:
    presence = get_presence()
    online_ids = set(await presence.list_online())

    friend_ids = await friends_service.friend_user_ids(session, current.id)
    friends: list[User] = []
    if friend_ids:
        rows = await session.scalars(select(User).where(User.id.in_(friend_ids)))
        friends = list(rows)

    online_out: list[OnlineUser] = []
    offline_out: list[OnlineUser] = []
    for u in friends:
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

    pending = await friends_service.incoming_pending_requests(session, current.id)
    incoming = [
        FriendRequestPublic(
            id=fr.id,
            from_user=UserPublic.from_model(fr.from_user),
            created_at=fr.created_at,
        )
        for fr in pending
    ]

    settings = get_settings()
    bot_u = settings.bot_username.strip() or None

    return FriendsDirectoryResponse(
        online=online_out,
        offline=offline_out,
        external=external,
        incoming_requests=incoming,
        telegram_bot_username=bot_u,
    )


@router.post("/request", response_model=FriendRequestActionResponse)
async def send_friend_request(
    body: FriendRequestCreate,
    current: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> FriendRequestActionResponse:
    try:
        fr = await friends_service.create_friend_request(
            session, current.id, body.user_id
        )
    except ValueError as exc:
        code = str(exc)
        if code == "user_not_found":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Пользователь не найден",
            ) from exc
        if code == "cannot_friend_self":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Нельзя добавить себя",
            ) from exc
        if code == "already_friends":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Уже в друзьях",
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=code,
        ) from exc

    return FriendRequestActionResponse(
        id=fr.id,
        status=fr.status.value,
        from_user_id=fr.from_user_id,
        to_user_id=fr.to_user_id,
    )


@router.post("/requests/{request_id}/accept", response_model=FriendRequestActionResponse)
async def accept_friend_request(
    request_id: int,
    current: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> FriendRequestActionResponse:
    try:
        fr = await friends_service.accept_request(session, request_id, current.id)
    except ValueError as exc:
        code = str(exc)
        status_code = status.HTTP_404_NOT_FOUND
        if code == "forbidden":
            status_code = status.HTTP_403_FORBIDDEN
        elif code == "not_pending":
            status_code = status.HTTP_409_CONFLICT
        raise HTTPException(status_code=status_code, detail=code) from exc

    return FriendRequestActionResponse(
        id=fr.id,
        status=fr.status.value,
        from_user_id=fr.from_user_id,
        to_user_id=fr.to_user_id,
    )


@router.post("/requests/{request_id}/decline", response_model=FriendRequestActionResponse)
async def decline_friend_request(
    request_id: int,
    current: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> FriendRequestActionResponse:
    try:
        fr = await friends_service.decline_request(session, request_id, current.id)
    except ValueError as exc:
        code = str(exc)
        status_code = status.HTTP_404_NOT_FOUND
        if code == "forbidden":
            status_code = status.HTTP_403_FORBIDDEN
        elif code == "not_pending":
            status_code = status.HTTP_409_CONFLICT
        raise HTTPException(status_code=status_code, detail=code) from exc

    return FriendRequestActionResponse(
        id=fr.id,
        status=fr.status.value,
        from_user_id=fr.from_user_id,
        to_user_id=fr.to_user_id,
    )


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_friend(
    user_id: int,
    current: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    removed = await friends_service.remove_friendship(session, current.id, user_id)
    if not removed:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Дружба не найдена",
        )
