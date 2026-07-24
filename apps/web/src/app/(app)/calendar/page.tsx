"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { addDays, format, startOfWeek } from "date-fns";
import { RefreshCw } from "lucide-react";
import { formatTime, priorityColor } from "@/lib/format";

type CalData = {
  blocks: Array<{
    id: string;
    start: string;
    end: string;
    task: { id: string; title: string; priority: number; atRisk: boolean };
  }>;
  meetings: Array<{
    id: string;
    subject: string;
    start: string;
    end: string;
    isMomentum: boolean;
  }>;
  outlookConnected: boolean;
};

export default function CalendarPage() {
  const [data, setData] = useState<CalData | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const weekStart = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 1 }), []);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const load = useCallback(async () => {
    const res = await fetch("/api/calendar?days=7");
    if (res.ok) setData(await res.json());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function reschedule() {
    setScheduling(true);
    await fetch("/api/schedule/run", { method: "POST" });
    await load();
    setScheduling(false);
  }

  return (
    <div className="rise" style={{ display: "grid", gap: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "end" }}>
        <div>
          <h1
            style={{
              margin: 0,
              fontFamily: "var(--font-display), serif",
              fontSize: "1.85rem",
            }}
          >
            Calendar
          </h1>
          <p style={{ margin: "0.35rem 0 0", color: "var(--ink-muted)" }}>
            Outlook meetings (hard) + Momentum focus blocks (soft).
          </p>
        </div>
        <button className="btn secondary" onClick={reschedule} disabled={scheduling}>
          <RefreshCw size={16} /> {scheduling ? "Syncing…" : "Sync & pack"}
        </button>
      </div>

      {data && !data.outlookConnected && (
        <div className="card" style={{ padding: "1rem" }}>
          <strong>Outlook not connected yet.</strong>
          <p style={{ margin: "0.4rem 0 0", color: "var(--ink-muted)" }}>
            Sign in with Microsoft and grant calendar permissions. Scheduling still packs into work
            hours without busy times until Graph is available.
          </p>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "0.65rem",
        }}
      >
        {days.map((day) => {
          const dayStart = day;
          const dayEnd = addDays(day, 1);
          const meetings =
            data?.meetings.filter((m) => {
              if (m.isMomentum) return false;
              const s = new Date(m.start);
              return s >= dayStart && s < dayEnd;
            }) ?? [];
          const blocks =
            data?.blocks.filter((b) => {
              const s = new Date(b.start);
              return s >= dayStart && s < dayEnd;
            }) ?? [];

          return (
            <div key={day.toISOString()} className="card" style={{ padding: "0.85rem" }}>
              <div style={{ fontWeight: 650, marginBottom: "0.65rem" }}>
                {format(day, "EEE d MMM")}
              </div>
              <div style={{ display: "grid", gap: "0.4rem" }}>
                {meetings.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      padding: "0.45rem 0.55rem",
                      borderRadius: "8px",
                      background: "rgba(20,36,28,0.06)",
                      fontSize: "0.82rem",
                    }}
                  >
                    <div style={{ color: "var(--ink-muted)" }}>
                      {formatTime(m.start)}–{formatTime(m.end)}
                    </div>
                    {m.subject}
                  </div>
                ))}
                {blocks.map((b) => (
                  <Link
                    key={b.id}
                    href={`/tasks/${b.task.id}`}
                    style={{
                      padding: "0.45rem 0.55rem",
                      borderRadius: "8px",
                      background: "rgba(47,107,80,0.14)",
                      borderLeft: `3px solid ${priorityColor(b.task.priority)}`,
                      fontSize: "0.82rem",
                      display: "block",
                    }}
                  >
                    <div style={{ color: "var(--ink-muted)" }}>
                      {formatTime(b.start)}–{formatTime(b.end)}
                    </div>
                    {b.task.title}
                    {b.task.atRisk ? " ⚠" : ""}
                  </Link>
                ))}
                {meetings.length === 0 && blocks.length === 0 && (
                  <div style={{ color: "var(--ink-muted)", fontSize: "0.82rem" }}>Open</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
