import { useEffect, useState } from "react";
import { apiUrl, setDeviceToken, clearStoredSyncApiBase, getSyncApiBase } from "@/lib/sync-api";
import { syncAfterDeviceLink } from "@/lib/local/sync";

async function finishWithToken(token: string, onLinked: () => void) {
  setDeviceToken(token);
  await syncAfterDeviceLink();
  const probe = await fetch(apiUrl("/api/workspaces"), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!probe.ok) {
    throw new Error("Signed in, but could not load workspaces. Try again.");
  }
  onLinked();
}

function parseAuthDeepLink(url: string): string | null {
  try {
    // app.momentum.plan://auth?token=...
    const q = url.includes("?") ? url.slice(url.indexOf("?") + 1) : "";
    const params = new URLSearchParams(q);
    const token = params.get("token");
    return token && token.length > 20 ? token : null;
  } catch {
    return null;
  }
}

export function LoginPage({
  onOffline,
  onLinked,
}: {
  onOffline: () => void;
  onLinked: () => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let removeUrl: (() => void) | undefined;
    let removeState: (() => void) | undefined;

    void (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const urlSub = await App.addListener("appUrlOpen", (event) => {
          const token = parseAuthDeepLink(event.url);
          if (!token) return;
          setGoogleBusy(true);
          setError(null);
          void import("@capacitor/browser")
            .then(({ Browser }) => Browser.close())
            .catch(() => undefined);
          void finishWithToken(token, onLinked)
            .catch((err) => {
              setError(err instanceof Error ? err.message : "Google sign-in failed");
            })
            .finally(() => setGoogleBusy(false));
        });
        removeUrl = () => {
          void urlSub.remove();
        };

        // If the deep link launched a cold start, App.getLaunchUrl may hold it.
        const launch = await App.getLaunchUrl().catch(() => undefined);
        if (launch?.url) {
          const token = parseAuthDeepLink(launch.url);
          if (token) {
            setGoogleBusy(true);
            void finishWithToken(token, onLinked)
              .catch((err) => {
                setError(err instanceof Error ? err.message : "Google sign-in failed");
              })
              .finally(() => setGoogleBusy(false));
          }
        }

        const stateSub = await App.addListener("appStateChange", ({ isActive }) => {
          if (!isActive) return;
          void import("@capacitor/browser")
            .then(({ Browser }) => Browser.close())
            .catch(() => undefined);
        });
        removeState = () => {
          void stateSub.remove();
        };
      } catch {
        // Web preview — deep links unavailable.
      }
    })();

    return () => {
      removeUrl?.();
      removeState?.();
    };
  }, [onLinked]);

  async function linkAccount(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      clearStoredSyncApiBase();
      const digits = code.replace(/\D/g, "").slice(0, 6);
      if (digits.length !== 6) {
        throw new Error("Enter the 6-digit code from Settings");
      }
      const res = await fetch(apiUrl("/api/auth/device-token"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: digits }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not link device");
      }
      const data = await res.json();
      if (!data?.token) throw new Error("No sync token returned");
      await finishWithToken(data.token, onLinked);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Link failed");
    } finally {
      setBusy(false);
    }
  }

  async function continueWithGoogle() {
    setGoogleBusy(true);
    setError(null);
    try {
      clearStoredSyncApiBase();
      const base = getSyncApiBase() || "https://momentum.momentum-app.workers.dev";
      const url = `${base}/mobile-auth/google`;
      const { Browser } = await import("@capacitor/browser");
      const finished = await Browser.addListener("browserFinished", () => {
        setGoogleBusy(false);
        void finished.remove();
      });
      await Browser.open({ url, presentationStyle: "popover" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open Google sign-in");
      setGoogleBusy(false);
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
            Sign in with Google to sync, enter a 6-digit code from the web app, or stay offline.
          </p>
        </div>

        <button
          type="button"
          className="btn"
          disabled={googleBusy || busy}
          onClick={() => void continueWithGoogle()}
        >
          {googleBusy ? "Waiting for Google…" : "Continue with Google"}
        </button>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            alignItems: "center",
            gap: "0.65rem",
          }}
        >
          <div style={{ height: 1, background: "var(--line)" }} />
          <span style={{ fontSize: "0.75rem", color: "var(--ink-muted)" }}>or</span>
          <div style={{ height: 1, background: "var(--line)" }} />
        </div>

        <form onSubmit={(e) => void linkAccount(e)} style={{ display: "grid", gap: "0.65rem" }}>
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
          <button className="btn secondary" type="submit" disabled={busy || googleBusy}>
            {busy ? "Linking…" : "Link with code"}
          </button>
        </form>

        <button type="button" className="btn secondary" onClick={onOffline} disabled={googleBusy}>
          Use offline only
        </button>
      </div>
    </div>
  );
}
