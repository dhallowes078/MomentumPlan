import { signIn } from "@/lib/auth";

export default function LoginPage() {
  const localLoginEnabled = process.env.AUTH_ALLOW_LOCAL_LOGIN === "true";
  const microsoftLoginEnabled = Boolean(
    process.env.AUTH_MICROSOFT_ENTRA_ID_ID &&
      process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET
  );

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "1.5rem",
      }}
    >
      <div
        className="card rise"
        style={{
          width: "min(440px, 100%)",
          padding: "2rem 1.75rem",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(135deg, rgba(31,77,58,0.12), transparent 45%, rgba(196,92,38,0.1))",
            pointerEvents: "none",
          }}
        />
        <div style={{ position: "relative" }}>
          <p
            style={{
              fontFamily: "var(--font-display), serif",
              fontSize: "2.4rem",
              margin: 0,
              letterSpacing: "-0.03em",
              lineHeight: 1.05,
            }}
          >
            Momentum
          </p>
          <p style={{ color: "var(--ink-muted)", marginTop: "0.75rem", lineHeight: 1.5 }}>
            Priority tasks, time estimates, and Outlook free time — auto-packed into a day that
            reshuffles when life moves.
          </p>
          <div style={{ display: "grid", gap: "0.75rem", marginTop: "1.75rem" }}>
            {localLoginEnabled && (
              <form
                action={async () => {
                  "use server";
                  await signIn("local", { redirectTo: "/today" });
                }}
              >
                <button className="btn" type="submit" style={{ width: "100%" }}>
                  Continue locally
                </button>
              </form>
            )}
            {microsoftLoginEnabled && (
              <form
                action={async () => {
                  "use server";
                  await signIn("microsoft-entra-id", { redirectTo: "/today" });
                }}
              >
                <button className="btn" type="submit" style={{ width: "100%" }}>
                  Continue with Microsoft
                </button>
              </form>
            )}
          </div>
          <p style={{ fontSize: "0.8rem", color: "var(--ink-muted)", marginTop: "1rem" }}>
            {localLoginEnabled
              ? "Local mode stores your data on this device. Connect Microsoft later for Outlook calendar sync."
              : "Uses Microsoft Graph for calendar read/write. Personal and work accounts supported."}
          </p>
        </div>
      </div>
    </div>
  );
}
