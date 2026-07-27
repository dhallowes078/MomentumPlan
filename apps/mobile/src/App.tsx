import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { Providers } from "@/components/Providers";
import { TodayView } from "@/components/TodayView";
import TasksPage from "@/app/(app)/tasks/page";
import CalendarPage from "@/app/(app)/calendar/page";
import SettingsPage from "@/app/(app)/settings/page";
import TaskDetailPage from "@/app/(app)/tasks/[id]/page";
import { bootLocalSync } from "@/lib/local/sync";
import { initNotifications } from "@/lib/local/notifications";
import { getDeviceToken } from "@/lib/sync-api";
import { LoginPage } from "./pages/LoginPage";

function FullApp() {
  return (
    <Providers>
      <AppShell userName="You">
        <Routes>
          <Route path="/" element={<Navigate to="/today" replace />} />
          <Route path="/today" element={<TodayView />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/tasks/:id" element={<TaskDetailPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/today" replace />} />
        </Routes>
      </AppShell>
    </Providers>
  );
}

export function App() {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(() => {
    if (typeof window === "undefined") return false;
    return Boolean(getDeviceToken()) || localStorage.getItem("momentum_offline_ok") === "1";
  });

  useEffect(() => {
    document.documentElement.classList.add("is-native");
    void bootLocalSync().finally(() => setReady(true));
    void initNotifications().catch(() => undefined);
    void import("@capacitor/status-bar")
      .then(async ({ StatusBar, Style }) => {
        await StatusBar.setOverlaysWebView({ overlay: false });
        await StatusBar.setStyle({ style: Style.Light });
      })
      .catch(() => undefined);
  }, []);

  if (!ready) {
    return (
      <div className="page-wrap" style={{ padding: "2rem", color: "var(--ink-muted)" }}>
        Starting Momentum…
      </div>
    );
  }

  if (!authed) {
    return (
      <LoginPage
        onOffline={() => {
          localStorage.setItem("momentum_offline_ok", "1");
          setAuthed(true);
        }}
        onLinked={() => {
          localStorage.setItem("momentum_offline_ok", "1");
          setAuthed(true);
        }}
      />
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/today" replace />} />
      <Route path="/*" element={<FullApp />} />
    </Routes>
  );
}
