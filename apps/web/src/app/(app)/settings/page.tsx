"use client";

import { useCallback, useEffect, useState } from "react";
import { signOut } from "next-auth/react";

type Prefs = {
  workDays: number[];
  startMinutes: number;
  endMinutes: number;
  breakStartMinutes: number | null;
  breakEndMinutes: number | null;
  planningDays: number;
  minChunkMinutes: number;
  bufferMinutes: number;
  timezone: string;
};

type Workspace = {
  id: string;
  name: string;
  role: string;
  members?: { user: { id: string; email: string; name: string | null }; role: string }[];
  invites?: { id: string; email: string; token: string }[];
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function minutesToInput(m: number) {
  const h = Math.floor(m / 60)
    .toString()
    .padStart(2, "0");
  const min = (m % 60).toString().padStart(2, "0");
  return `${h}:${min}`;
}

function inputToMinutes(v: string) {
  const [h, m] = v.split(":").map(Number);
  return h * 60 + m;
}

export default function SettingsPage() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [activeWs, setActiveWs] = useState("");
  const [bucketName, setBucketName] = useState("");
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const [p, w] = await Promise.all([
      fetch("/api/prefs").then((r) => r.json()),
      fetch("/api/workspaces").then((r) => r.json()),
    ]);
    setPrefs(p.prefs);
    setWorkspaces(w.workspaces);
    const wid = activeWs || w.workspaces[0]?.id;
    if (wid) {
      setActiveWs(wid);
      const detail = await fetch(`/api/workspaces/${wid}`).then((r) => r.json());
      setWorkspaces((prev) =>
        prev.map((x) => (x.id === wid ? { ...x, ...detail.workspace, role: x.role } : x))
      );
    }
  }, [activeWs]);

  useEffect(() => {
    void load();
  }, [load]);

  async function savePrefs(e: React.FormEvent) {
    e.preventDefault();
    if (!prefs) return;
    await fetch("/api/prefs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(prefs),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!activeWs || !inviteEmail.trim()) return;
    await fetch(`/api/workspaces/${activeWs}/invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail }),
    });
    setInviteEmail("");
    await load();
  }

  async function addBucket(e: React.FormEvent) {
    e.preventDefault();
    if (!activeWs || !bucketName.trim()) return;
    await fetch("/api/buckets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: activeWs, name: bucketName }),
    });
    setBucketName("");
    await load();
  }

  const current = workspaces.find((w) => w.id === activeWs);

  return (
    <div className="rise" style={{ display: "grid", gap: "1rem", maxWidth: 720 }}>
      <div>
        <h1
          style={{
            margin: 0,
            fontFamily: "var(--font-display), serif",
            fontSize: "1.85rem",
          }}
        >
          Settings
        </h1>
        <p style={{ margin: "0.35rem 0 0", color: "var(--ink-muted)" }}>
          Work hours, buckets, and basic workspace sharing.
        </p>
      </div>

      {prefs && (
        <form className="card" style={{ padding: "1rem", display: "grid", gap: "0.75rem" }} onSubmit={savePrefs}>
          <h2 style={{ margin: 0, fontSize: "1rem" }}>Schedule preferences</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
            {DAY_LABELS.map((label, idx) => {
              const on = prefs.workDays.includes(idx);
              return (
                <button
                  key={label}
                  type="button"
                  className="btn secondary"
                  style={on ? { background: "rgba(31,77,58,0.14)" } : undefined}
                  onClick={() =>
                    setPrefs({
                      ...prefs,
                      workDays: on
                        ? prefs.workDays.filter((d) => d !== idx)
                        : [...prefs.workDays, idx].sort(),
                    })
                  }
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
            <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem" }}>
              Day start
              <input
                className="field"
                type="time"
                value={minutesToInput(prefs.startMinutes)}
                onChange={(e) => setPrefs({ ...prefs, startMinutes: inputToMinutes(e.target.value) })}
              />
            </label>
            <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem" }}>
              Day end
              <input
                className="field"
                type="time"
                value={minutesToInput(prefs.endMinutes)}
                onChange={(e) => setPrefs({ ...prefs, endMinutes: inputToMinutes(e.target.value) })}
              />
            </label>
            <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem" }}>
              Break start
              <input
                className="field"
                type="time"
                value={minutesToInput(prefs.breakStartMinutes ?? 720)}
                onChange={(e) =>
                  setPrefs({ ...prefs, breakStartMinutes: inputToMinutes(e.target.value) })
                }
              />
            </label>
            <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem" }}>
              Break end
              <input
                className="field"
                type="time"
                value={minutesToInput(prefs.breakEndMinutes ?? 780)}
                onChange={(e) =>
                  setPrefs({ ...prefs, breakEndMinutes: inputToMinutes(e.target.value) })
                }
              />
            </label>
            <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem" }}>
              Planning window (days)
              <input
                className="field"
                type="number"
                min={1}
                max={30}
                value={prefs.planningDays}
                onChange={(e) => setPrefs({ ...prefs, planningDays: Number(e.target.value) })}
              />
            </label>
            <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem" }}>
              Min chunk (min)
              <input
                className="field"
                type="number"
                min={5}
                value={prefs.minChunkMinutes}
                onChange={(e) => setPrefs({ ...prefs, minChunkMinutes: Number(e.target.value) })}
              />
            </label>
          </div>
          <button className="btn" type="submit">
            {saved ? "Saved" : "Save preferences"}
          </button>
        </form>
      )}

      <section className="card" style={{ padding: "1rem", display: "grid", gap: "0.75rem" }}>
        <h2 style={{ margin: 0, fontSize: "1rem" }}>Workspace & buckets</h2>
        <select className="field" value={activeWs} onChange={(e) => setActiveWs(e.target.value)}>
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name} ({w.role})
            </option>
          ))}
        </select>
        <form onSubmit={addBucket} style={{ display: "flex", gap: "0.4rem" }}>
          <input
            className="field"
            placeholder="New bucket name"
            value={bucketName}
            onChange={(e) => setBucketName(e.target.value)}
          />
          <button className="btn secondary" type="submit">
            Add bucket
          </button>
        </form>
        {current?.role === "OWNER" && (
          <form onSubmit={invite} style={{ display: "grid", gap: "0.4rem" }}>
            <h3 style={{ margin: "0.5rem 0 0", fontSize: "0.95rem" }}>Invite member</h3>
            <div style={{ display: "flex", gap: "0.4rem" }}>
              <input
                className="field"
                type="email"
                placeholder="teammate@email.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
              <button className="btn secondary" type="submit">
                Invite
              </button>
            </div>
            {current.invites?.map((inv) => (
              <div key={inv.id} style={{ fontSize: "0.85rem", color: "var(--ink-muted)" }}>
                Pending: {inv.email} — share accept link{" "}
                <code>/api/invites/{inv.token}/accept</code> (POST while signed in as that email)
                or open{" "}
                <a href={`/invite/${inv.token}`} style={{ color: "var(--brand)" }}>
                  /invite/{inv.token}
                </a>
              </div>
            ))}
          </form>
        )}
        {current?.members && (
          <div>
            <h3 style={{ margin: "0.5rem 0", fontSize: "0.95rem" }}>Members</h3>
            {current.members.map((m) => (
              <div key={m.user.id} style={{ fontSize: "0.9rem" }}>
                {m.user.name ?? m.user.email} · {m.role}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card" style={{ padding: "1rem" }}>
        <h2 style={{ margin: "0 0 0.5rem", fontSize: "1rem" }}>Phone / PWA</h2>
        <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.9rem" }}>
          On your phone, open this site in Safari/Chrome and use “Add to Home Screen” for the
          Momentum portal.
        </p>
      </section>

      <button className="btn secondary" onClick={() => signOut({ callbackUrl: "/login" })}>
        Sign out
      </button>
    </div>
  );
}
