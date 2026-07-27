# Momentum Android (local APK)

Bundled install of the **same website UI** (Today, Tasks, Calendar, Settings, New Task modal, etc.) plus on-device Dexie storage.

It is **not** a WebView pointed at a live site. API calls are rewritten to your sync server when you link with a device code.

## Build APK

```powershell
# Optional: bake your tunnel as the default sync URL
$env:VITE_SYNC_API_URL="https://YOUR-tunnel.trycloudflare.com"

cd apps\mobile
npm run build
npx cap sync android

$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
cd android
.\gradlew.bat assembleDebug
```

Output: `android/app/build/outputs/apk/debug/app-debug.apk` (also copy to `Momentum-debug.apk` at repo root).

## First launch

1. **Use offline only**, or  
2. Enter sync server URL + 6-digit code from web **Settings → Devices**.

Keep `npm run dev` (and `npm run tunnel` if needed) running so sync works. Make sure the tunnel points at the same port Next is using.
