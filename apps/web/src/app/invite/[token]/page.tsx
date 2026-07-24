"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

export default function InviteAcceptPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function accept() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/invites/${params.token}/accept`, { method: "POST" });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Could not accept invite");
      return;
    }
    router.push("/tasks");
  }

  return (
    <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: "1.5rem" }}>
      <div className="card" style={{ padding: "1.5rem", width: "min(420px, 100%)", display: "grid", gap: "0.85rem" }}>
        <h1 style={{ margin: 0, fontFamily: "var(--font-display), serif" }}>Join workspace</h1>
        <p style={{ margin: 0, color: "var(--ink-muted)" }}>
          Accept this invite with the Microsoft account that matches the invited email.
        </p>
        {error && <p style={{ color: "var(--danger)", margin: 0 }}>{error}</p>}
        <button className="btn" onClick={accept} disabled={loading}>
          {loading ? "Joining…" : "Accept invite"}
        </button>
      </div>
    </div>
  );
}
