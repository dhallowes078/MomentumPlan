# Deploying Momentum

## Quick live URL (Cloudflare Tunnel) — works with current SQLite

Keeps your local Next.js + SQLite app and publishes a public `*.trycloudflare.com` URL.

```bash
# Terminal 1 — app
npm run dev

# Terminal 2 — tunnel
npm run tunnel
```

Copy the printed `https://….trycloudflare.com` link. On another device, open that URL, go to login, and paste your **6-digit device code** from Settings → Devices.

Update `AUTH_URL` / `NEXT_PUBLIC_APP_URL` in `apps/web/.env` to the tunnel URL if auth redirects misbehave, then restart `npm run dev`.

## Permanent Cloudflare Workers (OpenNext)

Workers have no persistent filesystem, so `file:./dev.db` cannot be used as-is.

1. `npx wrangler login`
2. Create D1: `npx wrangler d1 create momentum` and set `database_id` in `apps/web/wrangler.jsonc`
3. Switch Prisma to the D1 driver adapter (`@prisma/adapter-d1`) and point storage at R2
4. Install adapter: `npm i -w @momentum/web @opennextjs/cloudflare`
5. `npm run deploy -w @momentum/web`

See [OpenNext Cloudflare get started](https://opennext.js.org/cloudflare/get-started).

## Auth env for production

- `AUTH_SECRET` — required
- `AUTH_URL` / `NEXT_PUBLIC_APP_URL` — public site URL
- Optional: `AUTH_MICROSOFT_ENTRA_ID_*`, `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`
