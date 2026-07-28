"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

export function OAuthSignInButton({
  provider,
  label,
  className = "btn",
}: {
  provider: "google" | "microsoft-entra-id";
  label: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      className={className}
      style={{ width: "100%" }}
      disabled={busy}
      onClick={() => {
        setBusy(true);
        // Client signIn POSTs with CSRF — required for Auth.js OAuth (GET returns UnknownAction).
        void signIn(provider, { callbackUrl: "/today" }).finally(() => setBusy(false));
      }}
    >
      {busy ? "Redirecting…" : label}
    </button>
  );
}
