# Deploying Momentum

## Permanent Cloudflare Workers (always on)

The production site runs on Cloudflare Workers with **D1** (SQLite) and **KV** (attachments).

### One-time setup (already done for this account)

1. `npx wrangler login`
2. D1 database `momentum` + KV `momentum-attachments` bound in `apps/web/wrangler.jsonc`
3. Schema applied: `npm run db:d1-apply -w @momentum/web`
4. Secrets: `AUTH_SECRET` (and optional OAuth client secrets)

### Deploy / update

```bash
npm run deploy -w @momentum/web
```

Live URL: https://momentum.momentum-app.workers.dev

**Important:** OpenNext + Prisma needs the **Workers Paid** plan. On Free (10 ms CPU), pages often return **Error 1102 Worker exceeded resource limits**, especially on cold starts. Paid is ~$5/mo and raises the default CPU budget to 30 s.

Point the mobile app at that URL (`VITE_SYNC_API_URL`) and rebuild the APK.

Optional: set a custom domain on the Worker in the Cloudflare dashboard, then set `AUTH_URL` / `NEXT_PUBLIC_APP_URL` to that domain via `wrangler secret put` / vars.

### Local development

Keep using SQLite on disk:

```bash
npm run dev
```

`DATABASE_URL=file:./dev.db` in `apps/web/.env`. Cloudflare bindings are available in `next dev` via OpenNext’s local emulation when configured.

### Quick ephemeral tunnel (local only)

```bash
npm run tunnel
```

Not always-on — stops when your PC sleeps or the process exits.

### Auth env for production

- `AUTH_SECRET` — required (`npx wrangler secret put AUTH_SECRET`)
- `AUTH_URL` / `NEXT_PUBLIC_APP_URL` — set if using a custom domain
- Optional: `AUTH_MICROSOFT_ENTRA_ID_*`, `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`

### Google sign-in (optional)

1. Create an OAuth client in [Google Cloud Console](https://console.cloud.google.com/apis/credentials) (Web application).
2. Add authorized redirect URI:
   - `https://momentum.momentum-app.workers.dev/api/auth/callback/google`
   - plus `http://localhost:3000/api/auth/callback/google` for local dev
3. Put secrets on the Worker:

```bash
npx wrangler secret put AUTH_GOOGLE_ID
npx wrangler secret put AUTH_GOOGLE_SECRET
```

4. Redeploy: `npm run deploy -w @momentum/web`

The login page shows **Continue with Google** when both secrets are present.
