"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, CheckSquare, Cloud, CloudOff, Plus, Settings2, SunMedium } from "lucide-react";
import clsx from "clsx";
import { NewTaskModal } from "@/components/NewTaskModal";
import { TrafficLights } from "@/components/TrafficLights";
import { LocalDataProvider, useSync } from "@/components/LocalDataProvider";

const links = [
  { href: "/today", label: "Today", icon: SunMedium },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/settings", label: "More", icon: Settings2 },
];

function SyncBadge() {
  const { status, pending, refresh } = useSync();
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
  return (
    <button
      type="button"
      className="btn ghost compact"
      title="Sync with cloud"
      onClick={() => void refresh()}
      style={{ fontSize: "0.72rem", color: "var(--ink-muted)" }}
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

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    void import("@/lib/local/notifications")
      .then((m) => m.initNotifications())
      .catch(() => undefined);
    const id = window.setInterval(() => {
      void fetch("/api/schedule/run", { method: "POST" });
    }, 300_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="app-shell">
      <header
        className="card"
        style={{
          margin: "0.75rem",
          padding: "0.85rem 1.1rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
          gridColumn: "1 / -1",
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "var(--font-display), serif",
              fontSize: "1.35rem",
              fontWeight: 650,
              letterSpacing: "-0.02em",
            }}
          >
            Momentum
          </div>
          <div style={{ color: "var(--ink-muted)", fontSize: "0.85rem" }}>
            {userName ? `Plan for ${userName}` : "Auto-plan your day"}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          <SyncBadge />
          <TrafficLights />
        </div>
        <button
          className="btn"
          onClick={() => {
            setNewTaskMode("full");
            setNewTaskOpen(true);
          }}
        >
          <Plus size={16} /> New Task
        </button>
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
              {label === "More" ? "Settings" : label}
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
