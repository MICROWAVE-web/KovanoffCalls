from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import create_access_token
from app.config import get_settings
from app.db import get_session
from app.models import User
from app.redis_presence import close_presence, init_presence
from app.schemas import TelegramAuthRequest, TelegramAuthResponse, UserPublic
from app.signaling import router as signaling_router
from app.telegram_auth import TelegramAuthError, verify_init_data
from app.friends import router as friends_router
from app.users import router as users_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):  # type: ignore[no-untyped-def]
    await init_presence()
    logger.info("Backend started")
    try:
        yield
    finally:
        await close_presence()


settings = get_settings()

app = FastAPI(title="Kovanoff Calls API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/auth/telegram", response_model=TelegramAuthResponse)
async def auth_telegram(
    body: TelegramAuthRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> TelegramAuthResponse:
    try:
        verified = verify_init_data(body.initData, settings.bot_token)
    except TelegramAuthError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)
        ) from exc

    tg = verified.user
    user = await session.scalar(select(User).where(User.telegram_id == tg.id))
    if user is None:
        user = User(
            telegram_id=tg.id,
            username=tg.username,
            first_name=tg.first_name,
            last_name=tg.last_name,
            photo_url=tg.photo_url,
            language_code=tg.language_code,
        )
        session.add(user)
    else:
        user.username = tg.username
        user.first_name = tg.first_name
        user.last_name = tg.last_name
        user.photo_url = tg.photo_url
        user.language_code = tg.language_code

    user.last_seen = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(user)

    token = create_access_token(user.id, settings)
    return TelegramAuthResponse(access_token=token, user=UserPublic.from_model(user))


app.include_router(users_router)
app.include_router(friends_router)
app.include_router(signaling_router)
