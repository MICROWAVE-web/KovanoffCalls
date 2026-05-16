from __future__ import annotations

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import FriendRequest, FriendRequestStatus, User


async def are_friends(session: AsyncSession, user_a_id: int, user_b_id: int) -> bool:
    if user_a_id == user_b_id:
        return False
    row = await session.scalar(
        select(FriendRequest.id).where(
            FriendRequest.status == FriendRequestStatus.accepted,
            or_(
                (FriendRequest.from_user_id == user_a_id)
                & (FriendRequest.to_user_id == user_b_id),
                (FriendRequest.from_user_id == user_b_id)
                & (FriendRequest.to_user_id == user_a_id),
            ),
        )
    )
    return row is not None


async def friend_user_ids(session: AsyncSession, user_id: int) -> list[int]:
    rows = await session.scalars(
        select(FriendRequest).where(
            FriendRequest.status == FriendRequestStatus.accepted,
            or_(
                FriendRequest.from_user_id == user_id,
                FriendRequest.to_user_id == user_id,
            ),
        )
    )
    ids: list[int] = []
    for fr in rows:
        other = fr.to_user_id if fr.from_user_id == user_id else fr.from_user_id
        ids.append(other)
    return ids


async def get_relation(
    session: AsyncSession, current_id: int, other_id: int
) -> str:
    """Returns: none | friend | pending_out | pending_in"""
    if current_id == other_id:
        return "none"
    if await are_friends(session, current_id, other_id):
        return "friend"
    outgoing = await session.scalar(
        select(FriendRequest).where(
            FriendRequest.from_user_id == current_id,
            FriendRequest.to_user_id == other_id,
        )
    )
    if outgoing is not None:
        if outgoing.status == FriendRequestStatus.pending:
            return "pending_out"
        if outgoing.status == FriendRequestStatus.accepted:
            return "friend"
    incoming = await session.scalar(
        select(FriendRequest).where(
            FriendRequest.from_user_id == other_id,
            FriendRequest.to_user_id == current_id,
        )
    )
    if incoming is not None:
        if incoming.status == FriendRequestStatus.pending:
            return "pending_in"
        if incoming.status == FriendRequestStatus.accepted:
            return "friend"
    return "none"


async def create_friend_request(
    session: AsyncSession, from_user_id: int, to_user_id: int
) -> FriendRequest:
    if from_user_id == to_user_id:
        raise ValueError("cannot_friend_self")

    target = await session.scalar(select(User).where(User.id == to_user_id))
    if target is None:
        raise ValueError("user_not_found")

    if await are_friends(session, from_user_id, to_user_id):
        raise ValueError("already_friends")

    reverse = await session.scalar(
        select(FriendRequest).where(
            FriendRequest.from_user_id == to_user_id,
            FriendRequest.to_user_id == from_user_id,
        )
    )
    if reverse is not None and reverse.status == FriendRequestStatus.pending:
        reverse.status = FriendRequestStatus.accepted
        await session.commit()
        await session.refresh(reverse)
        return reverse

    existing = await session.scalar(
        select(FriendRequest).where(
            FriendRequest.from_user_id == from_user_id,
            FriendRequest.to_user_id == to_user_id,
        )
    )
    if existing is not None:
        if existing.status == FriendRequestStatus.pending:
            return existing
        if existing.status == FriendRequestStatus.accepted:
            raise ValueError("already_friends")
        existing.status = FriendRequestStatus.pending
        await session.commit()
        await session.refresh(existing)
        return existing

    fr = FriendRequest(
        from_user_id=from_user_id,
        to_user_id=to_user_id,
        status=FriendRequestStatus.pending,
    )
    session.add(fr)
    await session.commit()
    await session.refresh(fr)
    return fr


async def accept_request(
    session: AsyncSession, request_id: int, user_id: int
) -> FriendRequest:
    fr = await session.scalar(
        select(FriendRequest).where(FriendRequest.id == request_id)
    )
    if fr is None:
        raise ValueError("request_not_found")
    if fr.to_user_id != user_id:
        raise ValueError("forbidden")
    if fr.status != FriendRequestStatus.pending:
        raise ValueError("not_pending")
    fr.status = FriendRequestStatus.accepted
    await session.commit()
    await session.refresh(fr)
    return fr


async def decline_request(
    session: AsyncSession, request_id: int, user_id: int
) -> FriendRequest:
    fr = await session.scalar(
        select(FriendRequest).where(FriendRequest.id == request_id)
    )
    if fr is None:
        raise ValueError("request_not_found")
    if fr.to_user_id != user_id:
        raise ValueError("forbidden")
    if fr.status != FriendRequestStatus.pending:
        raise ValueError("not_pending")
    fr.status = FriendRequestStatus.declined
    await session.commit()
    await session.refresh(fr)
    return fr


async def remove_friendship(
    session: AsyncSession, user_id: int, friend_user_id: int
) -> bool:
    fr = await session.scalar(
        select(FriendRequest).where(
            FriendRequest.status == FriendRequestStatus.accepted,
            or_(
                (FriendRequest.from_user_id == user_id)
                & (FriendRequest.to_user_id == friend_user_id),
                (FriendRequest.from_user_id == friend_user_id)
                & (FriendRequest.to_user_id == user_id),
            ),
        )
    )
    if fr is None:
        return False
    await session.delete(fr)
    await session.commit()
    return True


async def incoming_pending_requests(
    session: AsyncSession, user_id: int
) -> list[FriendRequest]:
    rows = await session.scalars(
        select(FriendRequest)
        .where(
            FriendRequest.to_user_id == user_id,
            FriendRequest.status == FriendRequestStatus.pending,
        )
        .order_by(FriendRequest.created_at.desc())
    )
    return list(rows)
