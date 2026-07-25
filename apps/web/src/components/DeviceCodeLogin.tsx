"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

export function DeviceCodeLogin() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const digits = code.replace(/\D/g, "");
    if (digits.length !== 6) {
      setError("Enter the 6-digit code from Settings on your other device.");
      return;
    }
    setLoading(true);
    setError(null);
    const res = await signIn("device-code", {
      code: digits,
      redirect: false,
      callbackUrl: "/today",
    });
    setLoading(false);
    if (res?.error) {
      setError("That code didn’t match any account. Check and try again.");
      return;
    }
    window.location.href = res?.url || "/today";
  }

  return (
    <form onSubmit={(e) => void submit(e)} style={{ display: "grid", gap: "0.55rem" }}>
      <label style={{ display: "grid", gap: "0.3rem", fontSize: "0.85rem" }}>
        Device code
        <input
          className="field"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123 456"
          value={code}
          onChange={(e) => {
            const raw = e.target.value.replace(/\D/g, "").slice(0, 6);
            setCode(raw.length > 3 ? `${raw.slice(0, 3)} ${raw.slice(3)}` : raw);
          }}
          style={{
            fontFamily: "var(--font-display), serif",
            fontSize: "1.35rem",
            letterSpacing: "0.12em",
            textAlign: "center",
          }}
        />
      </label>
      {error && (
        <p style={{ margin: 0, color: "var(--danger)", fontSize: "0.85rem" }}>{error}</p>
      )}
      <button className="btn secondary" type="submit" disabled={loading} style={{ width: "100%" }}>
        {loading ? "Signing in…" : "Continue with device code"}
      </button>
    </form>
  );
}
