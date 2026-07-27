import { useState } from "react";
import {
  apiUrl,
  clearStoredSyncApiBase,
  getDeviceToken,
  setDeviceToken,
} from "@/lib/sync-api";
import { flushOutbox, pullFromServer, useSyncIndicator } from "./settings-helpers";
import { requestNotificationPermission, rescheduleTaskNotifications } from "@/lib/local/notifications";
import * as repo from "@/lib/local/repo";

export function SettingsPage() {
  const sync = useSyncIndicator();
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function link() {
    setBusy(true);
    setMessage(null);
    try {
      clearStoredSyncApiBase();
      const res = await fetch(apiUrl("/api/auth/device-token"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) throw new Error("Invalid code or server unreachable");
      const data = await res.json();
      setDeviceToken(data.token);
      await pullFromServer();
      await flushOutbox();
      setMessage("Device linked and synced");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Link failed");
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    setDeviceToken(null);
    setMessage("Unlinked — staying local-only");
  }

  async function syncNow() {
    setBusy(true);
    await flushOutbox();
    await pullFromServer();
    setBusy(false);
    setMessage("Sync finished");
  }

  return (
    <div className="page">
      <div>
        <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "1.75rem" }}>Settings</h1>
        <p style={{ margin: "0.3rem 0 0", color: "var(--ink-muted)" }}>
          Sync status: {sync.status}
          {sync.pending ? ` · ${sync.pending} pending` : ""}
        </p>
      </div>

      <section className="card" style={{ padding: "1rem", display: "grid", gap: "0.65rem" }}>
        <h2 style={{ margin: 0, fontSize: "1rem" }}>Cloud sync</h2>
        <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.9rem" }}>
          {getDeviceToken()
            ? "This phone is linked to Momentum cloud. Changes flush when online."
            : "Not linked. Enter the 6-digit code from the website Settings → Devices."}
        </p>
        <label style={{ display: "grid", gap: "0.3rem", fontSize: "0.85rem" }}>
          Access code
          <input className="field" value={code} onChange={(e) => setCode(e.target.value)} placeholder="000000" />
        </label>
        <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
          <button type="button" className="btn" disabled={busy} onClick={() => void link()}>
            Link device
          </button>
          <button type="button" className="btn secondary" disabled={busy} onClick={() => void syncNow()}>
            Sync now
          </button>
          <button type="button" className="btn secondary" onClick={unlink}>
            Unlink
          </button>
        </div>
        {message && <p style={{ margin: 0, fontSize: "0.9rem" }}>{message}</p>}
      </section>

      <section className="card" style={{ padding: "1rem", display: "grid", gap: "0.65rem" }}>
        <h2 style={{ margin: 0, fontSize: "1rem" }}>Notifications</h2>
        <button
          type="button"
          className="btn secondary"
          onClick={() =>
            void requestNotificationPermission().then(async (ok) => {
              if (ok) {
                const prefs = await repo.getPrefs();
                await repo.putPrefs({ ...prefs, notificationsEnabled: true }, false);
                await rescheduleTaskNotifications();
              }
              setMessage(ok ? "Notifications allowed" : "Permission denied");
            })
          }
        >
          Allow start / finish prompts
        </button>
      </section>
    </div>
  );
}
