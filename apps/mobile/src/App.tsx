import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, Link } from "react-router-dom";
import { CalendarDays, CheckSquare, Cloud, Settings2, SunMedium } from "lucide-react";
import clsx from "clsx";
import { bootLocalSync } from "@/lib/local/sync";
import { initNotifications } from "@/lib/local/notifications";
import { getDeviceToken } from "@/lib/sync-api";
import { LoginPage } from "./pages/LoginPage";
import { TodayPage } from "./pages/TodayPage";
import { TasksPage } from "./pages/TasksPage";
import { CalendarPage } from "./pages/CalendarPage";
import { SettingsPage } from "./pages/SettingsPage";

const links = [
  { href: "/today", label: "Today", icon: SunMedium },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/settings", label: "More", icon: Settings2 },
];

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = useLocation().pathname;
  return (
    <div className="app-shell">
      <header
        className="card"
        style={{
          margin: "0.75rem",
          padding: "0.85rem 1.1rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "0.75rem",
        }}
      >
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: "1.35rem", fontWeight: 650 }}>
            Momentum
          </div>
          <div style={{ color: "var(--ink-muted)", fontSize: "0.85rem" }}>Local on this device</div>
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", color: "var(--ink-muted)", fontSize: "0.78rem" }}>
          <Cloud size={14} />
          {getDeviceToken() ? "Linked" : "Offline"}
        </div>
      </header>
      <main>{children}</main>
      <nav className="card bottom-nav">
        {links.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              to={href}
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
    </div>
  );
}

export function App() {
  const [ready, setReady] = useState(false);
  const [offlineMode, setOfflineMode] = useState(
    () => typeof window !== "undefined" && localStorage.getItem("momentum_offline_ok") === "1"
  );

  useEffect(() => {
    void bootLocalSync().finally(() => setReady(true));
    void initNotifications().catch(() => undefined);
  }, []);

  if (!ready) {
    return (
      <div className="page" style={{ placeItems: "center", minHeight: "100dvh" }}>
        <p style={{ color: "var(--ink-muted)" }}>Starting Momentum…</p>
      </div>
    );
  }

  const authed = Boolean(getDeviceToken()) || offlineMode;

  return (
    <Routes>
      <Route
        path="/login"
        element={
          authed ? (
            <Navigate to="/today" replace />
          ) : (
            <LoginPage
              onOffline={() => {
                localStorage.setItem("momentum_offline_ok", "1");
                setOfflineMode(true);
              }}
              onLinked={() => setOfflineMode(true)}
            />
          )
        }
      />
      <Route
        path="/*"
        element={
          !authed ? (
            <Navigate to="/login" replace />
          ) : (
            <Shell>
              <Routes>
                <Route path="/" element={<Navigate to="/today" replace />} />
                <Route path="/today" element={<TodayPage />} />
                <Route path="/tasks" element={<TasksPage />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/today" replace />} />
              </Routes>
            </Shell>
          )
        }
      />
    </Routes>
  );
}
