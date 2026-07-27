import { useState } from "react";
import { apiUrl, setDeviceToken, setSyncApiBase, getSyncApiBase } from "@/lib/sync-api";
import { pullFromServer, flushOutbox } from "@/lib/local/sync";

export function LoginPage({
  onOffline,
  onLinked,
}: {
  onOffline: () => void;
  onLinked: () => void;
}) {
  const [code, setCode] = useState("");
  const [apiBase, setApiBase] = useState(getSyncApiBase());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function linkAccount(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (apiBase.trim()) setSyncApiBase(apiBase.trim());
      const res = await fetch(apiUrl("/api/auth/device-token"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not link device");
      }
      const data = await res.json();
      setDeviceToken(data.token);
      await pullFromServer();
      await flushOutbox();
      onLinked();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Link failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page" style={{ minHeight: "100dvh", placeContent: "center" }}>
      <div className="card" style={{ padding: "1.5rem", display: "grid", gap: "0.85rem" }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "1.85rem" }}>
            Momentum
          </h1>
          <p style={{ margin: "0.4rem 0 0", color: "var(--ink-muted)" }}>
            Tasks stay on this phone. Link with your 6-digit code to sync to the cloud.
          </p>
        </div>

        <form onSubmit={(e) => void linkAccount(e)} style={{ display: "grid", gap: "0.65rem" }}>
          <label style={{ display: "grid", gap: "0.3rem", fontSize: "0.85rem" }}>
            Sync server URL (tunnel or LAN)
            <input
              className="field"
              placeholder="https://….trycloudflare.com"
              value={apiBase}
              onChange={(e) => setApiBase(e.target.value)}
            />
          </label>
          <label style={{ display: "grid", gap: "0.3rem", fontSize: "0.85rem" }}>
            Device access code
            <input
              className="field"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000 000"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          {error && <p style={{ margin: 0, color: "var(--danger)", fontSize: "0.9rem" }}>{error}</p>}
          <button className="btn" type="submit" disabled={busy}>
            {busy ? "Linking…" : "Link this device"}
          </button>
        </form>

        <button type="button" className="btn secondary" onClick={onOffline}>
          Use offline only
        </button>
      </div>
    </div>
  );
}
