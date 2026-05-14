from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    bot_token: str = Field(..., alias="BOT_TOKEN")
    """Bot @username without @; used for t.me links from API/Mini App."""
    bot_username: str = Field("", alias="BOT_USERNAME")
    webapp_url: str = Field(..., alias="WEBAPP_URL")

    jwt_secret: str = Field(..., alias="JWT_SECRET")
    jwt_exp_days: int = Field(7, alias="JWT_EXP_DAYS")
    jwt_algorithm: str = "HS256"

    database_url: str = Field(..., alias="DATABASE_URL")
    redis_url: str = Field("redis://redis:6379/0", alias="REDIS_URL")

    presence_ttl_seconds: int = Field(60, alias="PRESENCE_TTL_SECONDS")
    ring_timeout_seconds: int = Field(30, alias="RING_TIMEOUT_SECONDS")

    allowed_origins: str = Field("*", alias="ALLOWED_ORIGINS")

    @property
    def cors_origins(self) -> list[str]:
        raw = self.allowed_origins.strip()
        if raw == "*" or not raw:
            return ["*"]
        return [origin.strip() for origin in raw.split(",") if origin.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
