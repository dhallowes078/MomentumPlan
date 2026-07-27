# Momentum Android (local APK)

The installable app is a **bundled SPA** (UI + Dexie on-device). It is **not** a WebView pointed at a website.

Cloud sync is optional: enter your sync server URL + 6-digit access code (from the web app → Settings → Devices).

## Develop the SPA

```bash
npm install -w @momentum/mobile
npm run dev -w @momentum/mobile
```

## Build debug APK

1. Start the API on your PC: `npm run dev` (and optionally `npm run tunnel`).
2. Build + sync + assemble:

```powershell
cd apps\mobile
# Optional: bake a default sync URL into the client
$env:VITE_SYNC_API_URL="https://YOUR-tunnel.trycloudflare.com"
npm run build
npx cap sync android

$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
cd android
.\gradlew.bat assembleDebug
```

APK path:

`apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`

Also copied to repo root as `Momentum-debug.apk` when using the root helper script.

## First launch on phone

1. **Use offline only** — tasks stay on the device, or  
2. Enter sync server URL + device code → pulls/pushes to the Next.js API.

Google / Microsoft / Facebook login comes later; device code is the bridge for now.
