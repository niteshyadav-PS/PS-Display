# Profile Solution Display (MERN)

Digital signage platform for **Profile Solution** — inspired by Mango Display functionality.

## Structure

| Folder | Purpose |
|--------|---------|
| `frontend/` | Admin portal (login, dashboard, create/edit displays, media, settings) |
| `backend/` | Node.js + Express + MongoDB API |
| `display/` | Full-screen player for Android TV / browser screens |

## Prerequisites

- Node.js 20+
- MongoDB running locally (`mongodb://127.0.0.1:27017`)

## Setup

```bash
# Install every workspace at once
npm run install:all

# Copy the env templates and fill them in
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
cp display/.env.example display/.env

# Generate a real JWT secret and paste it into backend/.env
npm --prefix backend run secret

# Seed demo data (drops and recreates all collections)
npm run seed

# Start the API, admin portal and player together
npm run dev
```

Individual apps can still be started on their own with `npm run dev:backend`,
`npm run dev:frontend` and `npm run dev:display`.

## Default login

- Email: `admin@profilesolution.com`
- Password: `admin1234` (override with `SEED_ADMIN_PASSWORD`)

## URLs

- Admin: http://localhost:5173
- API: http://localhost:5000/api
- Player: http://localhost:5174/d/&lt;publicKey&gt;
- Pairing screen: http://localhost:5174/pair

## Core flows

1. Login → Dashboard
2. My Displays → Add New Display (device → name → layout)
3. Editor → add widgets → set a schedule → Save → Publish
4. Copy the player URL, or open `/pair` on the TV and type the display's pairing code

## Features

### Scheduling (dayparting)

Both a whole display and each individual page can be limited to a date range,
specific weekdays, and a time window. An end time earlier than the start time
means the window crosses midnight (e.g. `22:00 → 06:00`). The player evaluates
schedules locally so they keep working without a network connection.

### Offline resilience

Every successful poll is written to `localStorage`. If the API becomes
unreachable the player keeps showing the last good layout, backs off its polling
exponentially, and shows a small "Showing saved copy" badge. A screen that
reboots with no network still plays from cache.

### Device pairing

Each display gets a short code (for example `K7M2QP`). In **My Displays** click
**PAIR** to see the code, then enter it on the TV's `/pair` screen. The TV
remembers the display it was paired to across reboots. Issue a new code to
revoke an old one.

## Environment reference

Everything is documented in `backend/.env.example`. The values worth knowing:

| Variable | Purpose |
|---|---|
| `JWT_SECRET` | **Required.** Must be 32+ characters; the server refuses to start in production with a placeholder. |
| `CORS_ORIGINS` | Comma-separated browser origins allowed to call the API. Falls back to `CLIENT_URL` + `DISPLAY_PLAYER_URL`. |
| `MAX_UPLOAD_MB` | Upload size cap (default 50). |
| `MAX_PROXY_MB` | Cap on remote files fetched through the media proxy (default 25). |
| `DISPLAY_OFFLINE_AFTER_SEC` | How long without a poll before a screen counts as offline (default 90). |
| `PUBLIC_API_URL` | Set when running behind a reverse proxy so upload URLs are absolute and correct. |

## Security notes

- `helmet`, response compression, and a strict CORS allowlist are enabled.
- Login and password-reset endpoints are rate limited; the API and media proxy
  have their own separate limits.
- The media and web proxies refuse non-HTTP(S) schemes, URLs with embedded
  credentials, and any host that resolves to a private, loopback, or
  link-local address (this blocks SSRF against cloud metadata endpoints).
- All write endpoints validate and whitelist their payloads with Zod, so widget
  types, colours, and geometry cannot be used to smuggle arbitrary data.
- Password reset uses single-use SHA-256 hashed tokens with a one-hour expiry.
  No mail transport is wired up yet, so the link is logged to the server console
  and returned by the API in development only.

## Scripts

Run from the repository root:

| Command | Effect |
|---|---|
| `npm run dev` | API + admin + player together |
| `npm run build` | Production build of admin and player |
| `npm run lint` | Lint all three packages |
| `npm run seed` | Reset and reseed the database |
