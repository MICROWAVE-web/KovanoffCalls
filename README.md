# Kovanoff Calls

MVP Telegram Mini App для 1:1 WebRTC-видеозвонков.

* **Backend**: FastAPI + WebSocket-сигналинг, SQLAlchemy 2.0 (Postgres), Redis presence, JWT-аутентификация, проверка Telegram WebApp `initData`.
* **Bot**: aiogram3 — `/start` с кнопкой запуска WebApp + push-уведомления о входящих звонках для офлайн-пользователей.
* **Frontend**: Vite + React + TypeScript (strict) + Tailwind CSS, нативный `RTCPeerConnection`, нативный `WebSocket`, Telegram WebApp SDK.
* **Infra**: Docker Compose (`backend`, `bot`, `postgres`, `redis`, `frontend`).

---

## Структура репозитория

```text
backend/         FastAPI-приложение + bot + миграции Alembic
frontend/        Vite + React TS mini app
docker-compose.yml
.env.example
```

## 1. Создание Telegram-бота

1. Напишите [@BotFather](https://t.me/BotFather), выполните `/newbot`, получите **BOT_TOKEN**.
2. `/mybots` → выберите бота → **Bot Settings → Menu Button → Configure menu button** и вставьте публичный HTTPS URL мини-приложения (тот же, что и `WEBAPP_URL`).
3. Опционально выполните `/setdomain` для домена URL.

## 2. Откройте frontend по HTTPS

Telegram WebApps должны обслуживаться через HTTPS. Для локальной разработки проще всего использовать ngrok или cloudflared:

```bash
ngrok http 5173
# или
cloudflared tunnel --url http://localhost:5173
```

Возьмите полученный URL вида `https://*.ngrok.app` и установите его как `WEBAPP_URL` в `.env`. Backend и WebSocket также должны быть доступны извне; в этом MVP API обслуживается по `${WEBAPP_URL}/api` через отдельный туннель или единый reverse proxy. Самый простой вариант — два туннеля:

```bash
ngrok http 5173       # → WEBAPP_URL          (например https://app.ngrok.app)
ngrok http 8000       # → VITE_API_BASE_URL   (например https://api.ngrok.app)
```

Затем в `.env`:

```env
WEBAPP_URL=https://app.ngrok.app
VITE_API_BASE_URL=https://api.ngrok.app
VITE_WS_BASE_URL=wss://api.ngrok.app
ALLOWED_ORIGINS=https://app.ngrok.app
```

(Если всё работает через единый reverse proxy, установите одинаковый origin для всех трёх параметров и направьте `/api` на backend.)

## 3. Настройка окружения

```bash
cp .env.example .env
# заполните BOT_TOKEN, BOT_USERNAME, WEBAPP_URL, JWT_SECRET и VITE_* URL
```

## 4. Запуск

```bash
docker compose up --build
```

* Postgres на `localhost:5432`
* Redis на `localhost:6379`
* Backend на `localhost:8000` (`/health`, `POST /auth/telegram`, `GET /users/online`, `GET /users/directory`, `WS /ws`)
* Frontend на `localhost:5173`
* Bot service запускает aiogram polling

Backend-контейнер выполняет `alembic upgrade head` при старте для применения миграций.

## 5. Тест звонка

1. Откройте своего бота в Telegram, отправьте `/start`, нажмите **Open Calls**.
2. Mini App автоматически проходит аутентификацию через `initData` и показывает раздел **People**: онлайн-пользователей, зарегистрированных офлайн-пользователей и Telegram-контакты, добавленные через бота (см. ниже).
3. Откройте того же бота со второго Telegram-аккаунта (другое устройство или Telegram Desktop с другим аккаунтом) и запустите приложение.
4. Нажмите **Call** на другом пользователе — получатель увидит модальное окно входящего звонка.
5. Примите звонок → WebRTC offer/answer + ICE согласование → начнётся видео.
6. Используйте кнопки управления внизу: mute, отключение камеры, переключение камеры, завершение звонка.

## Каталог пользователей и Telegram-контакты

* **`GET /users/directory`** возвращает три списка для текущего пользователя: `online` (presence из Redis), `offline` (другие зарегистрированные пользователи не в сети) и `external` (строки из `user_shared_peers`, где `peer_telegram_id` ещё отсутствует в `users`).
* Установите **`BOT_USERNAME`** в `.env` (имя бота `@name` без `@`). API включает его как `telegram_bot_username`, чтобы Mini App мог открывать ссылки `t.me/...`. Также можно установить **`VITE_TELEGRAM_BOT_USERNAME`** при сборке frontend как fallback.
* **Добавление контактов**: в приложении нажмите **Add from Telegram** — вы будете перенаправлены к боту с `?start=addcontacts`. Бот покажет кнопки с использованием **`KeyboardButtonRequestUsers`** (выбор до 10 Telegram-пользователей) и **`request_contact`** (если переданный контакт содержит Telegram `user_id`). Данные сохраняются в Postgres; вернитесь в mini app и нажмите **Refresh**.
* **Invite** (не внутри приложения): **Invite** открывает Telegram share dialog со ссылкой на вашего бота, чтобы другой пользователь мог зарегистрироваться.

## Заметки по архитектуре

* **Telegram auth**: `POST /auth/telegram` проверяет `initData` согласно спецификации Telegram WebApp (`HMAC_SHA256` с `secret_key = HMAC_SHA256("WebAppData", BOT_TOKEN)`), выполняет upsert пользователя и возвращает JWT (HS256, срок действия по умолчанию — 7 дней).
* **Presence**: каждое подключение WS устанавливает `presence:user:{id}=1` в Redis с TTL `PRESENCE_TTL_SECONDS` (периодически обновляется). `GET /users/online` и секция `online` в `GET /users/directory` используют одинаковый presence scan с join к `users`.
* **Signaling**: единый endpoint `/ws?token=<JWT>` обрабатывает `call_invite`, `call_accept`, `call_decline`, `offer`, `answer`, `ice_candidate` и `call_end`. Звонки сохраняются в Postgres (`pending → active → ended | declined | missed`). Watcher тайм-аута звонка (`RING_TIMEOUT_SECONDS`) помечает неотвеченные приглашения как `missed`.
* **Офлайн-уведомления**: если у вызываемого пользователя нет активного WS-соединения, API публикует JSON-сообщение в Redis pub/sub канал `bot:notifications`. Сервис `bot` подписывается на канал и отправляет сообщение в Telegram с inline-кнопкой WebApp, чтобы пользователь мог открыть mini app и ответить.
* **WebRTC**: нативный `RTCPeerConnection` с публичным STUN-сервером Google. Вызывающий создаёт offer после `call_accept`; принимающий создаёт answer после получения offer. ICE-кандидаты передаются через signaling WS.

## Checklist для production (помимо MVP)

* Разместите backend за HTTPS + WSS через reverse proxy (например, Caddy/Nginx) вместо ngrok.
* Добавьте TURN-сервер для работы за строгими NAT.
* Добавьте Redis pub/sub в signaling layer для масштабирования за пределы одного backend-инстанса.
* Добавьте rate limit для `/auth/telegram` и `call_invite`.
* Регулярно ротируйте `JWT_SECRET`, используйте длинное случайное значение.

## Советы по разработке

```bash
# Только backend (без docker)
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
# задайте DATABASE_URL, REDIS_URL, BOT_TOKEN, BOT_USERNAME, WEBAPP_URL, JWT_SECRET в env
alembic upgrade head
uvicorn app.main:app --reload --port 8000

# Только frontend
cd frontend
npm install
npm run dev
```
