from __future__ import annotations

import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import parse_qsl


class TelegramAuthError(Exception):
    pass


@dataclass(frozen=True)
class TelegramUser:
    id: int
    first_name: str | None
    last_name: str | None
    username: str | None
    photo_url: str | None
    language_code: str | None


@dataclass(frozen=True)
class VerifiedInitData:
    user: TelegramUser
    auth_date: int
    raw: dict[str, str]


def _build_data_check_string(parsed: list[tuple[str, str]]) -> str:
    pairs = [(k, v) for k, v in parsed if k != "hash"]
    pairs.sort(key=lambda kv: kv[0])
    return "\n".join(f"{k}={v}" for k, v in pairs)


def verify_init_data(
    init_data: str,
    bot_token: str,
    *,
    max_age_seconds: int = 24 * 60 * 60,
) -> VerifiedInitData:
    """Verify Telegram WebApp initData signature.

    Per https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app:
      secret_key = HMAC_SHA256(key="WebAppData", msg=bot_token)
      expected_hash = HMAC_SHA256(key=secret_key, msg=data_check_string)
    """
    if not init_data:
        raise TelegramAuthError("Пустой initData")

    parsed = parse_qsl(init_data, keep_blank_values=True)
    data: dict[str, str] = dict(parsed)

    received_hash = data.get("hash")
    if not received_hash:
        raise TelegramAuthError("Отсутствует hash")

    data_check_string = _build_data_check_string(parsed)

    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    computed = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(computed, received_hash):
        raise TelegramAuthError("Неверная подпись")

    auth_date_str = data.get("auth_date")
    if not auth_date_str:
        raise TelegramAuthError("Отсутствует auth_date")
    try:
        auth_date = int(auth_date_str)
    except ValueError as exc:
        raise TelegramAuthError("Некорректный auth_date") from exc

    if max_age_seconds > 0 and (time.time() - auth_date) > max_age_seconds:
        raise TelegramAuthError("initData устарел")

    user_json = data.get("user")
    if not user_json:
        raise TelegramAuthError("Отсутствуют данные пользователя")
    try:
        user_obj: dict[str, Any] = json.loads(user_json)
    except json.JSONDecodeError as exc:
        raise TelegramAuthError("Некорректный JSON пользователя") from exc

    try:
        tg_user = TelegramUser(
            id=int(user_obj["id"]),
            first_name=user_obj.get("first_name"),
            last_name=user_obj.get("last_name"),
            username=user_obj.get("username"),
            photo_url=user_obj.get("photo_url"),
            language_code=user_obj.get("language_code"),
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise TelegramAuthError("Некорректные данные пользователя") from exc

    return VerifiedInitData(user=tg_user, auth_date=auth_date, raw=data)
