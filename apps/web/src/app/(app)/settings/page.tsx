"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { signIn, signOut } from "next-auth/react";
import { Check, Copy, RefreshCw } from "lucide-react";
import { THEME_PRESETS } from "@/lib/theme";
import { useThemePrefs } from "@/components/ThemeProvider";

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
  tinyMinutes: number;
  smallMinutes: number;
  mediumMinutes: number;
  bigMinutes: number;
  themeColor: string;
  darkMode: boolean;
};

type Bucket = { id: string; name: string; color: string };

type Workspace = {
  id: string;
  name: string;
  role: string;
  buckets?: Bucket[];
  members?: {
    user: {
      id: string;
      email: string;
      name: string | null;
      color?: string | null;
      image?: string | null;
    };
    role: string;
  }[];
  invites?: { id: string; email: string; token: string }[];
};

type Profile = {
  id: string;
  name: string | null;
  email: string;
  color: string;
  image: string | null;
  imageUrl?: string | null;
};

type Integrations = {
  microsoftAuthConfigured: boolean;
  googleAuthConfigured: boolean;
  outlookCalendar: { connected: boolean; updatedAt?: string };
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const BUCKET_COLORS = ["#3D6B4F", "#2F5D8C", "#8B5E3C", "#7A2E3A", "#0F766E", "#6B4A2F", "#B7791F"];
const PROFILE_COLORS = ["#3D6B4F", "#2F5D8C", "#8B5E3C", "#7A2E3A", "#0F766E", "#B7791F", "#6B4A2F", "#5B4B8A"];

const TABS = [
  { id: "profile", label: "Profile" },
  { id: "devices", label: "Devices" },
  { id: "appearance", label: "Appearance" },
  { id: "sizes", label: "Sizes" },
  { id: "schedule", label: "Schedule" },
  { id: "workspace", label: "Workspace" },
  { id: "integrations", label: "Integrations" },
  { id: "phone", label: "Phone" },
] as const;

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
  const theme = useThemePrefs();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [integrations, setIntegrations] = useState<Integrations | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [activeWs, setActiveWs] = useState("");
  const [bucketName, setBucketName] = useState("");
  const [bucketColor, setBucketColor] = useState(BUCKET_COLORS[0]);
  const [saved, setSaved] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [accessCode, setAccessCode] = useState<string | null>(null);
  const [accessDisplay, setAccessDisplay] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("profile");
  const initialWs = useRef(false);

  const loadWorkspaceDetail = useCallback(async (wid: string) => {
    const detail = await fetch(`/api/workspaces/${wid}`).then((r) => r.json());
    setWorkspaces((prev) =>
      prev.map((x) => (x.id === wid ? { ...x, ...detail.workspace, role: x.role } : x))
    );
  }, []);

  const load = useCallback(async () => {
    const [p, w, me, codeRes, integ] = await Promise.all([
      fetch("/api/prefs").then((r) => r.json()),
      fetch("/api/workspaces").then((r) => r.json()),
      fetch("/api/me").then((r) => r.json()),
      fetch("/api/me/access-code").then((r) => r.json()),
      fetch("/api/integrations").then((r) => r.json()),
    ]);
    setPrefs(p.prefs);
    setWorkspaces(w.workspaces);
    setProfile(me.user);
    setIntegrations(integ);
    if (codeRes.code) {
      setAccessCode(codeRes.code);
      setAccessDisplay(codeRes.display ?? codeRes.code);
    }
    const wid = activeWs || w.workspaces[0]?.id;
    if (wid) {
      if (!activeWs) setActiveWs(wid);
      await loadWorkspaceDetail(wid);
    }
  }, [activeWs, loadWorkspaceDetail]);

  useEffect(() => {
    if (initialWs.current) return;
    initialWs.current = true;
    void load();
  }, [load]);

  useEffect(() => {
    if (!activeWs || !initialWs.current) return;
    void loadWorkspaceDetail(activeWs);
  }, [activeWs, loadWorkspaceDetail]);

  useEffect(() => {
    const onScroll = () => {
      let current = TABS[0].id;
      for (const tab of TABS) {
        const el = document.getElementById(`settings-${tab.id}`);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= 120) current = tab.id;
      }
      setActiveTab(current);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function jumpTo(id: string) {
    setActiveTab(id);
    document.getElementById(`settings-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function savePrefs(next?: Partial<Prefs>) {
    if (!prefs) return;
    const payload = { ...prefs, ...next };
    setPrefs(payload);
    theme.setThemeLocal({
      themeColor: payload.themeColor,
      darkMode: payload.darkMode,
      tinyMinutes: payload.tinyMinutes,
      smallMinutes: payload.smallMinutes,
      mediumMinutes: payload.mediumMinutes,
      bigMinutes: payload.bigMinutes,
    });
    await fetch("/api/prefs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  async function saveProfile(next: Partial<Profile>, file?: File | null) {
    if (!profile) return;
    const fd = new FormData();
    if (next.name != null) fd.set("name", next.name);
    if (next.color) fd.set("color", next.color);
    if (file) fd.set("avatar", file);
    const res = await fetch("/api/me", { method: "PATCH", body: fd });
    if (!res.ok) return;
    const data = await res.json();
    setProfile(data.user);
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 1500);
  }

  async function copyCode() {
    if (!accessCode) return;
    await navigator.clipboard.writeText(accessCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  async function regenerateCode() {
    if (!confirm("Generate a new device code? The old code will stop working on other devices.")) {
      return;
    }
    const res = await fetch("/api/me/access-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ regenerate: true }),
    });
    if (!res.ok) return;
    const data = await res.json();
    setAccessCode(data.code);
    setAccessDisplay(data.display);
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
    await loadWorkspaceDetail(activeWs);
  }

  async function addBucket(e: React.FormEvent) {
    e.preventDefault();
    if (!activeWs || !bucketName.trim()) return;
    const res = await fetch("/api/buckets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: activeWs, name: bucketName, color: bucketColor }),
    });
    if (res.ok) {
      const { bucket } = await res.json();
      setWorkspaces((prev) =>
        prev.map((w) =>
          w.id === activeWs ? { ...w, buckets: [...(w.buckets ?? []), bucket] } : w
        )
      );
    }
    setBucketName("");
  }

  async function updateBucketColor(id: string, color: string) {
    setWorkspaces((prev) =>
      prev.map((w) =>
        w.id !== activeWs
          ? w
          : {
              ...w,
              buckets: (w.buckets ?? []).map((b) => (b.id === id ? { ...b, color } : b)),
            }
      )
    );
    await fetch(`/api/buckets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ color }),
    });
  }

  const current = workspaces.find((w) => w.id === activeWs);

  const futureIntegrations = [
    { name: "Google Calendar", detail: "Pull free/busy and create Momentum blocks." },
    { name: "Apple Calendar", detail: "iCloud calendar sync via CalDAV." },
    { name: "Todoist", detail: "Import tasks and push completed work back." },
    { name: "Notion", detail: "Sync databases as Momentum task sources." },
    { name: "Slack", detail: "Capture tasks from messages and reminders." },
  ];

  return (
    <div className="page-wrap rise">
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
          Profile, devices, theme, schedule, workspace, and integrations.
        </p>
      </div>

      <nav className="settings-tabs" aria-label="Settings sections">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className="settings-tab"
            data-active={activeTab === tab.id ? "true" : "false"}
            onClick={() => jumpTo(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {profile && (
        <section
          id="settings-profile"
          className="card settings-section"
          style={{ padding: "1rem", display: "grid", gap: "0.85rem" }}
        >
          <h2 style={{ margin: 0, fontSize: "1rem" }}>Your profile</h2>
          <div style={{ display: "flex", gap: "0.85rem", alignItems: "center" }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                overflow: "hidden",
                background: profile.color,
                display: "grid",
                placeItems: "center",
                color: "#fff",
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {profile.imageUrl || profile.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.imageUrl || profile.image || ""}
                  alt=""
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                (profile.name ?? profile.email).slice(0, 1).toUpperCase()
              )}
            </div>
            <div style={{ display: "grid", gap: "0.4rem", flex: 1 }}>
              <input
                className="field"
                value={profile.name ?? ""}
                placeholder="Display name"
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                onBlur={() => void saveProfile({ name: profile.name ?? "" })}
              />
              <label className="btn secondary" style={{ width: "fit-content", cursor: "pointer" }}>
                Change photo
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void saveProfile({}, f);
                  }}
                />
              </label>
            </div>
          </div>
          <div>
            <div style={{ fontSize: "0.85rem", marginBottom: "0.4rem" }}>Your colour</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", alignItems: "center" }}>
              {PROFILE_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className="palette-swatch"
                  data-active={profile.color.toLowerCase() === color.toLowerCase() ? "true" : "false"}
                  style={{ background: color }}
                  onClick={() => {
                    setProfile({ ...profile, color });
                    void saveProfile({ color });
                  }}
                />
              ))}
              <input
                type="color"
                value={profile.color}
                onChange={(e) => {
                  const color = e.target.value;
                  setProfile({ ...profile, color });
                  void saveProfile({ color });
                }}
                title="Custom colour"
                style={{ width: 42, height: 34, border: "none", background: "transparent", cursor: "pointer" }}
              />
            </div>
          </div>
          {profileSaved && (
            <div style={{ fontSize: "0.85rem", color: "var(--ok)" }}>Profile saved</div>
          )}
        </section>
      )}

      <section
        id="settings-devices"
        className="card settings-section"
        style={{ padding: "1rem", display: "grid", gap: "0.85rem" }}
      >
        <h2 style={{ margin: 0, fontSize: "1rem" }}>Devices & access code</h2>
        <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.9rem" }}>
          Copy this 6-digit code, then paste it on the login screen of another device to open the
          same account and tasks.
        </p>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.65rem",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-display), serif",
              fontSize: "2rem",
              letterSpacing: "0.18em",
              padding: "0.35rem 0.15rem",
            }}
          >
            {accessDisplay ?? "······"}
          </div>
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            <button className="btn" type="button" onClick={() => void copyCode()} disabled={!accessCode}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? "Copied" : "Copy"}
            </button>
            <button className="btn secondary" type="button" onClick={() => void regenerateCode()}>
              <RefreshCw size={16} /> New code
            </button>
          </div>
        </div>
      </section>

      {prefs && (
        <>
          <section
            id="settings-appearance"
            className="card settings-section"
            style={{ padding: "1rem", display: "grid", gap: "0.85rem" }}
          >
            <h2 style={{ margin: 0, fontSize: "1rem" }}>Appearance</h2>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
              <div>
                <strong>Dark theme</strong>
                <div style={{ color: "var(--ink-muted)", fontSize: "0.85rem" }}>
                  Slide on for a darker workspace.
                </div>
              </div>
              <button
                type="button"
                className="switch"
                data-on={prefs.darkMode ? "true" : "false"}
                aria-pressed={prefs.darkMode}
                onClick={() => void savePrefs({ darkMode: !prefs.darkMode })}
              />
            </div>
            <div>
              <div style={{ fontSize: "0.85rem", marginBottom: "0.45rem" }}>Theme colour</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.55rem", alignItems: "center" }}>
                {THEME_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className="palette-swatch"
                    title={preset.label}
                    data-active={prefs.themeColor.toLowerCase() === preset.color.toLowerCase() ? "true" : "false"}
                    style={{ background: preset.color }}
                    onClick={() => void savePrefs({ themeColor: preset.color })}
                  />
                ))}
                <input
                  type="color"
                  value={prefs.themeColor}
                  onChange={(e) => void savePrefs({ themeColor: e.target.value })}
                  style={{ width: 42, height: 34, border: "none", background: "transparent", cursor: "pointer" }}
                  title="Custom colour"
                />
              </div>
            </div>
          </section>

          <section
            id="settings-sizes"
            className="card settings-section"
            style={{ padding: "1rem", display: "grid", gap: "0.75rem" }}
          >
            <h2 style={{ margin: 0, fontSize: "1rem" }}>Job size presets</h2>
            <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.9rem" }}>
              Tiny / Small / Medium / Big estimate lengths used when creating tasks.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.5rem" }}>
              {(
                [
                  ["tinyMinutes", "Tiny"],
                  ["smallMinutes", "Small"],
                  ["mediumMinutes", "Medium"],
                  ["bigMinutes", "Big"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem" }}>
                  {label} (min)
                  <input
                    className="field"
                    type="number"
                    min={5}
                    step={5}
                    value={prefs[key]}
                    onChange={(e) => setPrefs({ ...prefs, [key]: Number(e.target.value) })}
                  />
                </label>
              ))}
            </div>
            <button className="btn secondary" type="button" onClick={() => void savePrefs()}>
              {saved ? "Saved" : "Save size presets"}
            </button>
          </section>

          <form
            id="settings-schedule"
            className="card settings-section"
            style={{ padding: "1rem", display: "grid", gap: "0.75rem" }}
            onSubmit={(e) => {
              e.preventDefault();
              void savePrefs();
            }}
          >
            <h2 style={{ margin: 0, fontSize: "1rem" }}>Schedule preferences</h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
              {DAY_LABELS.map((label, idx) => {
                const on = prefs.workDays.includes(idx);
                return (
                  <button
                    key={label}
                    type="button"
                    className="btn secondary"
                    style={on ? { background: "color-mix(in srgb, var(--brand) 14%, transparent)" } : undefined}
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
        </>
      )}

      <section
        id="settings-workspace"
        className="card settings-section"
        style={{ padding: "1rem", display: "grid", gap: "0.75rem" }}
      >
        <h2 style={{ margin: 0, fontSize: "1rem" }}>Workspace & buckets</h2>
        <select className="field" value={activeWs} onChange={(e) => setActiveWs(e.target.value)}>
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name} ({w.role})
            </option>
          ))}
        </select>

        <div style={{ display: "grid", gap: "0.45rem" }}>
          {current?.buckets?.map((b) => (
            <div
              key={b.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.75rem",
                padding: "0.45rem 0",
                borderBottom: "1px solid var(--line)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span className="bucket-swatch" style={{ background: b.color }} />
                <strong>{b.name}</strong>
              </div>
              <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", alignItems: "center" }}>
                {BUCKET_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className="palette-swatch"
                    data-active={b.color.toLowerCase() === color.toLowerCase() ? "true" : "false"}
                    style={{ background: color, width: 22, height: 22 }}
                    onClick={() => void updateBucketColor(b.id, color)}
                    title="Set bucket colour"
                  />
                ))}
                <input
                  type="color"
                  value={b.color}
                  onChange={(e) => void updateBucketColor(b.id, e.target.value)}
                  title="Custom bucket colour"
                  style={{ width: 28, height: 24, border: "none", background: "transparent", cursor: "pointer" }}
                />
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={addBucket} style={{ display: "grid", gap: "0.5rem" }}>
          <div style={{ display: "flex", gap: "0.4rem" }}>
            <input
              className="field"
              placeholder="New bucket name"
              value={bucketName}
              onChange={(e) => setBucketName(e.target.value)}
            />
            <button className="btn secondary" type="submit">
              Add bucket
            </button>
          </div>
          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", alignItems: "center" }}>
            {BUCKET_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className="palette-swatch"
                data-active={bucketColor === color ? "true" : "false"}
                style={{ background: color, width: 24, height: 24 }}
                onClick={() => setBucketColor(color)}
              />
            ))}
            <input
              type="color"
              value={bucketColor}
              onChange={(e) => setBucketColor(e.target.value)}
              title="Custom colour"
              style={{ width: 28, height: 24, border: "none", background: "transparent", cursor: "pointer" }}
            />
          </div>
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
                Pending: {inv.email} —{" "}
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
              <div
                key={m.user.id}
                style={{
                  fontSize: "0.9rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.45rem",
                  marginBottom: "0.25rem",
                }}
              >
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    background: m.user.color || "var(--brand)",
                    overflow: "hidden",
                    display: "inline-block",
                  }}
                />
                {m.user.name ?? m.user.email} · {m.role}
              </div>
            ))}
          </div>
        )}
      </section>

      <section
        id="settings-integrations"
        className="card settings-section"
        style={{ padding: "1rem", display: "grid", gap: "0.85rem" }}
      >
        <h2 style={{ margin: 0, fontSize: "1rem" }}>Integrations</h2>
        <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.9rem" }}>
          Sign-in providers and calendar apps. Ready ones connect now; others are staged for later.
        </p>

        <div style={{ display: "grid", gap: "0.55rem" }}>
          <div className="integration-row">
            <div>
              <strong>Microsoft</strong>
              <div style={{ fontSize: "0.85rem", color: "var(--ink-muted)" }}>
                Sign in + Outlook calendar via Microsoft Graph.
              </div>
            </div>
            {integrations?.microsoftAuthConfigured ? (
              <button
                className="btn secondary"
                type="button"
                onClick={() => void signIn("microsoft-entra-id", { callbackUrl: "/settings" })}
              >
                {integrations.outlookCalendar.connected ? "Reconnect" : "Connect"}
              </button>
            ) : (
              <span className="badge">Add AUTH_MICROSOFT_* env</span>
            )}
          </div>

          <div className="integration-row">
            <div>
              <strong>Google</strong>
              <div style={{ fontSize: "0.85rem", color: "var(--ink-muted)" }}>
                Sign in with Google (Calendar sync coming next).
              </div>
            </div>
            {integrations?.googleAuthConfigured ? (
              <button
                className="btn secondary"
                type="button"
                onClick={() => void signIn("google", { callbackUrl: "/settings" })}
              >
                Connect
              </button>
            ) : (
              <span className="badge">Coming soon</span>
            )}
          </div>

          <div className="integration-row">
            <div>
              <strong>Outlook Calendar</strong>
              <div style={{ fontSize: "0.85rem", color: "var(--ink-muted)" }}>
                {integrations?.outlookCalendar.connected
                  ? "Connected — free/busy used when packing your day."
                  : "Uses your Microsoft account when connected."}
              </div>
            </div>
            <span className="badge">
              {integrations?.outlookCalendar.connected ? "Connected" : "Not connected"}
            </span>
          </div>

          {futureIntegrations.map((item) => (
            <div key={item.name} className="integration-row">
              <div>
                <strong>{item.name}</strong>
                <div style={{ fontSize: "0.85rem", color: "var(--ink-muted)" }}>{item.detail}</div>
              </div>
              <span className="badge">Coming soon</span>
            </div>
          ))}
        </div>
      </section>

      <section id="settings-phone" className="card settings-section" style={{ padding: "1rem" }}>
        <h2 style={{ margin: "0 0 0.5rem", fontSize: "1rem" }}>Phone / PWA</h2>
        <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.9rem" }}>
          On your phone, open this site in Safari/Chrome and use “Add to Home Screen” for the
          Momentum portal. Use your device code from the Devices tab to sign in.
        </p>
      </section>

      <button className="btn secondary" onClick={() => signOut({ callbackUrl: "/login" })}>
        Sign out
      </button>
    </div>
  );
}
