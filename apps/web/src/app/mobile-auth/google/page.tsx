"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";

/**
 * Opens Google OAuth from the system browser (Capacitor Browser / Custom Tabs).
 * After success, Auth.js sends the user to /mobile-auth/complete which deep-links
 * back into the Android app with a device sync token.
 */
export default function MobileGoogleAuthPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void signIn("google", { callbackUrl: "/mobile-auth/complete" }).catch((err) => {
      setError(err instanceof Error ? err.message : "Could not start Google sign-in");
    });
  }, []);

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "1.5rem",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 360 }}>
        <p style={{ fontSize: "1.5rem", margin: 0, fontWeight: 600 }}>Momentum</p>
        <p style={{ color: "#5c6570", marginTop: "0.75rem" }}>
          {error ?? "Opening Google sign-in…"}
        </p>
        {error && (
          <button
            type="button"
            onClick={() => {
              setError(null);
              void signIn("google", { callbackUrl: "/mobile-auth/complete" });
            }}
            style={{
              marginTop: "1rem",
              padding: "0.65rem 1rem",
              borderRadius: 8,
              border: "none",
              background: "#1f4d3a",
              color: "#fff",
              fontWeight: 600,
            }}
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
