# Kovanoff Calls

MVP Telegram Mini App for 1:1 WebRTC video calls.

- **Backend**: FastAPI + WebSocket signaling, SQLAlchemy 2.0 (Postgres), Redis presence, JWT auth, Telegram WebApp `initData` verification.
- **Bot**: aiogram3 — `/start` with a WebApp launcher button + offline incoming-call push notifications.
- **Frontend**: Vite + React + TypeScript (strict) + Tailwind CSS, native `RTCPeerConnection`, native `WebSocket`, Telegram WebApp SDK.
- **Infra**: Docker Compose (`backend`, `bot`, `postgres`, `redis`, `frontend`).

---

## Repo layout

```
backend/         FastAPI app + bot + Alembic migrations
frontend/        Vite + React TS mini app
docker-compose.yml
.env.example
```

## 1. Create the Telegram bot

1. Talk to [@BotFather](https://t.me/BotFather), `/newbot`, grab the **BOT_TOKEN**.
2. `/mybots` → choose the bot → **Bot Settings → Menu Button → Configure menu button** and paste the public HTTPS URL of the mini app (the same as `WEBAPP_URL`).
3. Optionally `/setdomain` to the host part of the URL.

## 2. Expose the frontend over HTTPS

Telegram WebApps must be served over HTTPS. For local development the easiest way is to tunnel the frontend with ngrok or cloudflared:

```bash
ngrok http 5173
# or
cloudflared tunnel --url http://localhost:5173
```

Take the resulting `https://*.ngrok.app` URL and set it as `WEBAPP_URL` in `.env`. Backend & WebSocket must also be reachable; in this MVP we serve the API at `${WEBAPP_URL}/api` via a separate tunnel or a single reverse proxy. The simplest path is two tunnels:

```bash
ngrok http 5173       # → WEBAPP_URL          (e.g. https://app.ngrok.app)
ngrok http 8000       # → VITE_API_BASE_URL   (e.g. https://api.ngrok.app)
```

Then in `.env`:

```
WEBAPP_URL=https://app.ngrok.app
VITE_API_BASE_URL=https://api.ngrok.app
VITE_WS_BASE_URL=wss://api.ngrok.app
ALLOWED_ORIGINS=https://app.ngrok.app
```

(If you front everything with a single reverse proxy, set all three to the same origin and route `/api` to backend.)

## 3. Configure environment

```bash
cp .env.example .env
# fill BOT_TOKEN, BOT_USERNAME, WEBAPP_URL, JWT_SECRET, and the VITE_* URLs
```

## 4. Run

```bash
docker compose up --build
```

- Postgres on `localhost:5432`
- Redis on `localhost:6379`
- Backend on `localhost:8000` (`/health`, `POST /auth/telegram`, `GET /users/online`, `GET /users/directory`, `WS /ws`)
- Frontend on `localhost:5173`
- Bot service runs aiogram polling

The backend container runs `alembic upgrade head` on start to apply migrations.

## 5. Try a call

1. Open your bot in Telegram, send `/start`, tap **Open Calls**.
2. The Mini App auto-authenticates via `initData` and shows **People**: online, registered offline, and Telegram contacts you added via the bot (see below).
3. Open the same bot from a second Telegram account (different device or Telegram Desktop with a different account) and launch the app.
4. Tap **Call** on the other user — the recipient sees the incoming-call modal.
5. Accept → WebRTC offer/answer + ICE negotiate → video starts.
6. Use the controls at the bottom: mute, camera off, switch camera, end call.

## People directory and Telegram contacts

- **`GET /users/directory`** returns three lists for the current user: `online` (Redis presence), `offline` (other registered users not online), and `external` (rows in `user_shared_peers` whose `peer_telegram_id` is not yet in `users`).
- Set **`BOT_USERNAME`** in `.env` (the bot’s `@name` without `@`). The API includes it as `telegram_bot_username` so the Mini App can open `t.me/...` links. You may also set **`VITE_TELEGRAM_BOT_USERNAME`** at frontend build time as a fallback.
- **Add contacts**: in the app tap **Add from Telegram** — you are sent to the bot with `?start=addcontacts`. The bot shows buttons using **`KeyboardButtonRequestUsers`** (pick up to 10 Telegram users) and **`request_contact`** (when the shared contact has a Telegram `user_id`). Shared rows are stored in Postgres; return to the mini app and **Refresh**.
- **Invite** (not in app): **Invite** opens Telegram’s share dialog with a link to your bot so the peer can register.

## Architecture notes

- **Telegram auth**: `POST /auth/telegram` verifies `initData` per the Telegram WebApp spec (`HMAC_SHA256` with `secret_key = HMAC_SHA256("WebAppData", BOT_TOKEN)`), upserts the user, and returns a JWT (HS256, 7-day expiry by default).
- **Presence**: each connected WS sets `presence:user:{id}=1` in Redis with TTL `PRESENCE_TTL_SECONDS` (refreshed periodically). `GET /users/online` and the `online` section of `GET /users/directory` use the same presence scan joined with `users`.
- **Signaling**: a single `/ws?token=<JWT>` endpoint handles `call_invite`, `call_accept`, `call_decline`, `offer`, `answer`, `ice_candidate`, and `call_end`. Calls are persisted in Postgres (`pending → active → ended | declined | missed`). A ring-timeout watcher (`RING_TIMEOUT_SECONDS`) marks unanswered invites as `missed`.
- **Offline notifications**: when the callee has no active WS, the API publishes a JSON message to the Redis pub/sub channel `bot:notifications`. The `bot` service subscribes and sends a Telegram message with an inline WebApp button so the user can open the mini app and answer.
- **WebRTC**: native `RTCPeerConnection` with Google's public STUN. The caller creates the offer after `call_accept`; the callee creates the answer on receiving the offer. ICE candidates are exchanged over the signaling WS.

## Production checklist (beyond MVP)

- Put backend behind HTTPS + WSS via a reverse proxy (e.g. Caddy/Nginx) instead of ngrok.
- Add a TURN server for connectivity behind strict NATs.
- Add Redis pub/sub on the signaling layer to scale beyond a single backend instance.
- Add rate limits on `/auth/telegram` and `call_invite`.
- Rotate `JWT_SECRET`, use a long random value.

## Development tips

```bash
# Backend-only (without docker)
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
# set DATABASE_URL, REDIS_URL, BOT_TOKEN, BOT_USERNAME, WEBAPP_URL, JWT_SECRET in env
alembic upgrade head
uvicorn app.main:app --reload --port 8000

# Frontend-only
cd frontend
npm install
npm run dev
```
