# Momentum Android (Capacitor)

Native shell for local notifications (start/finish task prompts). The UI is the Next.js web app loaded remotely.

## Setup

1. Start the web app: `npm run dev` from the repo root.
2. Install mobile deps: `npm install -w @momentum/mobile`
3. Add Android platform (once): `npm run add:android -w @momentum/mobile`
4. Point at your server (emulator uses `10.0.2.2` for host localhost):

```bash
# Emulator → local Next
set MOMENTUM_SERVER_URL=http://10.0.2.2:3000

# Physical device → LAN IP or Cloudflare tunnel
set MOMENTUM_SERVER_URL=https://your-tunnel.trycloudflare.com
```

5. Sync and open Android Studio:

```bash
npm run sync -w @momentum/mobile
npm run open -w @momentum/mobile
```

6. Grant notification permission in Settings → Notifications inside the app.

## Behaviour

- Schedule blocks drive local notifications at start (“Have you started?”) and end (“Finished?”).
- Actions update the local Dexie store and sync to the cloud outbox.
- Ongoing focus notification while a task is `IN_PROGRESS` (Android).
