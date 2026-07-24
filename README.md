# Momentum

Motion-style personal task scheduler: prioritized tasks with time estimates are auto-packed into Outlook free time and reshuffled when plans change.

## Features

- Tasks with priority (1–5), estimates, due dates, buckets, links, attachments, comments, assignees, completion history
- Deterministic auto-scheduler (priority → due date → created) into work-hour free slots
- Microsoft Outlook via Graph (`Calendars.ReadWrite`) — meetings are hard blocks; Momentum writes soft focus events
- Solo-first workspaces with basic owner/member invites
- Responsive web UI + PWA (Add to Home Screen on phone)

## Stack

- Next.js 15 (App Router) + TypeScript
- Auth.js (Microsoft Entra ID)
- Prisma + SQLite (default; no Docker required)
- Optional Docker Compose for Postgres + MinIO later
- `@momentum/scheduler` pure packer package

## Quick start

```bash
cd momentum
npm install
cp apps/web/.env.example apps/web/.env   # or use the committed .env template
# Edit apps/web/.env — set AUTH_SECRET and Microsoft app credentials
npm run db:generate -w @momentum/web
npm run db:push -w @momentum/web
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Microsoft Entra app registration

1. Azure Portal → **App registrations** → **New registration**
2. Account types: **Accounts in any org directory and personal Microsoft accounts**
3. Redirect URI (Web): `http://localhost:3000/api/auth/callback/microsoft-entra-id`
4. Certificates & secrets → create a client secret
5. API permissions → Microsoft Graph delegated: `User.Read`, `Calendars.ReadWrite`, plus OpenID (`openid`, `profile`, `email`, `offline_access`)
6. Copy Application (client) ID and secret into `.env`:

```env
AUTH_MICROSOFT_ENTRA_ID_ID=...
AUTH_MICROSOFT_ENTRA_ID_SECRET=...
AUTH_MICROSOFT_ENTRA_ID_ISSUER=https://login.microsoftonline.com/common/v2.0
AUTH_SECRET=long-random-string
DATABASE_URL="file:./dev.db"
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js |
| `npm run test` | Scheduler unit tests |
| `npm run db:push -w @momentum/web` | Push Prisma schema |
| `docker compose up -d` | Optional Postgres + MinIO |

## Phone portal

Deploy or tunnel the app (e.g. Cloudflare Tunnel / ngrok), open in mobile Safari/Chrome, then **Add to Home Screen**. Bottom nav covers Today / Tasks / Calendar / Settings.

## How scheduling works

1. Load work hours + lunch break from preferences
2. Pull Outlook events; ignore Momentum-tagged events as busy
3. Sort open unlocked tasks by priority, due date, created
4. Greedy-pack into earliest free slots (optional splits ≥ min chunk)
5. Upsert Outlook events in category **Momentum**; flag **at-risk** when placement is after due date
6. Re-run on task changes, preference saves, or manual **Reschedule** / periodic poll

Locked tasks keep their scheduled window and are treated as busy for others.
