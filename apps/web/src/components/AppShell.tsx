"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarClock,
  CalendarDays,
  CheckSquare,
  Cloud,
  CloudOff,
  Plus,
  Settings2,
  SunMedium,
} from "lucide-react";
import clsx from "clsx";
import { NewTaskModal } from "@/components/NewTaskModal";
import { TrafficLights } from "@/components/TrafficLights";
import { LocalDataProvider, useSync } from "@/components/LocalDataProvider";

const links = [
  { href: "/today", label: "Today", icon: SunMedium },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

function SyncBadge() {
  const { status, pending, lastError, refresh } = useSync();
  const label =
    status === "offline"
      ? "Offline"
      : status === "syncing"
        ? "Saving…"
        : status === "error"
          ? "Sync issue"
          : pending > 0
            ? `${pending} pending`
            : "Synced";

  async function onTap() {
    if (status === "error" && lastError) {
      const retry = window.confirm(
        `Sync issue\n\n${lastError}\n\nTap OK to retry sync now.\n(Screenshot this message if it keeps failing.)`
      );
      if (!retry) return;
    }
    await refresh();
  }

  return (
    <button
      type="button"
      className="btn ghost compact"
      title={
        status === "error" && lastError
          ? `Sync issue: ${lastError}`
          : "Sync with cloud"
      }
      onClick={() => void onTap()}
      style={{
        fontSize: "0.72rem",
        color: status === "error" ? "var(--danger, #b45309)" : "var(--ink-muted)",
      }}
    >
      {status === "offline" || status === "error" ? <CloudOff size={14} /> : <Cloud size={14} />}
      {label}
    </button>
  );
}

function AppShellInner({
  children,
  userName,
}: {
  children: React.ReactNode;
  userName?: string | null;
}) {
  const pathname = usePathname();
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [newTaskMode, setNewTaskMode] = useState<"simple" | "full">("full");
  const [newVariant, setNewVariant] = useState<"task" | "event">("task");

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    void import("@/lib/local/notifications")
      .then((m) => m.initNotifications())
      .catch(() => undefined);
    // Avoid hammering the Worker schedule packer — it causes Error 1101 under load.
    // Packing runs locally on save; remote pack is fire-and-forget from saveAndSync.
  }, []);

  return (
    <div className="app-shell">
      <header className="card app-header">
        <div className="app-header-brand">
          <div className="app-header-title">Momentum</div>
          <div className="app-header-subtitle">
            {userName ? `Plan for ${userName}` : "Auto-plan your day"}
          </div>
        </div>
        <div className="app-header-meta">
          <SyncBadge />
          <TrafficLights compact />
        </div>
        <div className="app-header-actions">
          <button
            className="btn"
            onClick={() => {
              setNewVariant("task");
              setNewTaskMode("full");
              setNewTaskOpen(true);
            }}
          >
            <Plus size={16} /> <span className="app-header-cta-label">New Task</span>
          </button>
          <button
            className="btn secondary"
            onClick={() => {
              setNewVariant("event");
              setNewTaskMode("full");
              setNewTaskOpen(true);
            }}
          >
            <CalendarClock size={16} /> <span className="app-header-cta-label">New Event</span>
          </button>
        </div>
      </header>

      <aside className="card side-nav">
        <nav style={{ display: "grid", gap: "0.35rem" }}>
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={clsx(pathname.startsWith(href) && "nav-active")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.65rem",
                padding: "0.7rem 0.8rem",
                borderRadius: "10px",
              }}
            >
              <Icon size={18} />
              {label}
            </Link>
          ))}
        </nav>
      </aside>

      <main className="app-main">{children}</main>

      <nav className="card bottom-nav">
        {links.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={clsx(active && "nav-active")}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.2rem",
                padding: "0.45rem 0.25rem",
                borderRadius: "10px",
                fontSize: "0.72rem",
                fontWeight: 600,
                color: active ? "var(--brand)" : "var(--ink-muted)",
              }}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>

      <NewTaskModal
        open={newTaskOpen}
        initialMode={newTaskMode}
        variant={newVariant}
        onClose={() => setNewTaskOpen(false)}
      />
    </div>
  );
}

export function AppShell({
  children,
  userName,
}: {
  children: React.ReactNode;
  userName?: string | null;
}) {
  return (
    <LocalDataProvider>
      <AppShellInner userName={userName}>{children}</AppShellInner>
    </LocalDataProvider>
  );
}
