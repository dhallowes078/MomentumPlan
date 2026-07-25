"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { addDays, format, startOfDay } from "date-fns";
import { RefreshCw } from "lucide-react";
import { formatTime, priorityColor } from "@/lib/format";

type CalData = {
  blocks: Array<{
    id: string;
    start: string;
    end: string;
    task: {
      id: string;
      title: string;
      priority: number;
      atRisk: boolean;
      bucket?: { name: string; color: string } | null;
    };
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

function minutesToOffset(minutes: number, dayStart: number, pxPerMin: number) {
  return (minutes - dayStart) * pxPerMin;
}

function clockMinutes(iso: string) {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

export default function CalendarPage() {
  const [data, setData] = useState<CalData | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const [view, setView] = useState<"horizontal" | "vertical">("horizontal");
  const [workDays, setWorkDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [planningDays, setPlanningDays] = useState(14);
  const [startMinutes, setStartMinutes] = useState(540);
  const [endMinutes, setEndMinutes] = useState(1020);
  const [breakStart, setBreakStart] = useState<number | null>(720);
  const [breakEnd, setBreakEnd] = useState<number | null>(780);
  const [viewportH, setViewportH] = useState(800);
  const todayRef = useRef<HTMLDivElement | null>(null);

  const today = useMemo(() => startOfDay(new Date()), []);

  const days = useMemo(() => {
    const horizon = Math.max(planningDays, 14);
    const candidates = Array.from({ length: horizon + 7 }, (_, i) => addDays(today, i));
    return candidates
      .filter((day) => workDays.includes(day.getDay()))
      .slice(0, Math.max(workDays.length, planningDays));
  }, [today, workDays, planningDays]);

  const load = useCallback(async () => {
    const [calRes, prefsRes] = await Promise.all([
      fetch("/api/calendar?days=21"),
      fetch("/api/prefs"),
    ]);
    if (calRes.ok) setData(await calRes.json());
    if (prefsRes.ok) {
      const { prefs } = await prefsRes.json();
      const daysPref = Array.isArray(prefs.workDays) ? prefs.workDays : [1, 2, 3, 4, 5];
      setWorkDays(daysPref.length ? daysPref : [1, 2, 3, 4, 5]);
      setPlanningDays(prefs.planningDays ?? 14);
      setStartMinutes(prefs.startMinutes ?? 540);
      setEndMinutes(prefs.endMinutes ?? 1020);
      setBreakStart(prefs.breakStartMinutes ?? null);
      setBreakEnd(prefs.breakEndMinutes ?? null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const update = () => setViewportH(window.innerHeight);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    if (!days.length) return;
    const id = window.setTimeout(() => {
      todayRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
    }, 120);
    return () => window.clearTimeout(id);
  }, [days, view, data]);

  async function reschedule() {
    setScheduling(true);
    await fetch("/api/schedule/run", { method: "POST" });
    await load();
    setScheduling(false);
  }

  const daySpan = Math.max(endMinutes - startMinutes, 60);
  // Fit vertical timeline in the viewport so the page itself doesn't scroll.
  const verticalPxPerMin = Math.max(0.55, Math.min(1.25, (viewportH - 210) / daySpan));
  const horizontalPxPerMin = 2.2;
  const hours = Array.from(
    { length: Math.ceil(daySpan / 60) + 1 },
    (_, i) => startMinutes + i * 60
  ).filter((m) => m <= endMinutes);

  function dayContent(day: Date) {
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
    return { meetings, blocks };
  }

  return (
    <div className={`page-wrap wide rise ${view === "vertical" ? "cal-page-vertical" : ""}`}>
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
            Working days from today · breaks shown from your schedule settings.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          <button
            className="btn secondary"
            style={
              view === "horizontal"
                ? { background: "color-mix(in srgb, var(--brand) 14%, transparent)" }
                : undefined
            }
            onClick={() => setView("horizontal")}
          >
            Horizontal
          </button>
          <button
            className="btn secondary"
            style={
              view === "vertical"
                ? { background: "color-mix(in srgb, var(--brand) 14%, transparent)" }
                : undefined
            }
            onClick={() => setView("vertical")}
          >
            Vertical
          </button>
          <button className="btn secondary" onClick={reschedule} disabled={scheduling}>
            <RefreshCw size={16} /> {scheduling ? "Syncing…" : "Sync & pack"}
          </button>
        </div>
      </div>

      {data && !data.outlookConnected && (
        <div className="card" style={{ padding: "1rem" }}>
          <strong>Outlook not connected yet.</strong>
          <p style={{ margin: "0.4rem 0 0", color: "var(--ink-muted)" }}>
            Scheduling still packs into work hours. Incomplete tasks are pushed forward instead of
            marked missed.
          </p>
        </div>
      )}

      {view === "horizontal" ? (
        <div className="cal-horizontal">
          {days.map((day) => {
            const { meetings, blocks } = dayContent(day);
            const isToday = startOfDay(day).getTime() === today.getTime();
            const trackWidth = daySpan * horizontalPxPerMin;
            return (
              <div
                key={day.toISOString()}
                ref={isToday ? todayRef : undefined}
                className="card cal-horizontal-day"
                style={{
                  padding: "0.9rem",
                  outline: isToday ? "2px solid color-mix(in srgb, var(--brand) 35%, transparent)" : undefined,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                  <strong>{format(day, "EEE d MMM")}</strong>
                  {isToday && <span className="badge">Today</span>}
                </div>
                <div className="cal-horizontal-scroll">
                  <div className="cal-horizontal-track" style={{ width: trackWidth, minWidth: "100%" }}>
                    {hours.map((m) => (
                      <div
                        key={m}
                        className="cal-horizontal-hour"
                        style={{ left: minutesToOffset(m, startMinutes, horizontalPxPerMin) }}
                      >
                        {String(Math.floor(m / 60)).padStart(2, "0")}:
                        {String(m % 60).padStart(2, "0")}
                      </div>
                    ))}
                    {breakStart != null &&
                      breakEnd != null &&
                      breakEnd > breakStart && (
                        <div
                          className="cal-horizontal-break"
                          style={{
                            left: minutesToOffset(breakStart, startMinutes, horizontalPxPerMin),
                            width: Math.max((breakEnd - breakStart) * horizontalPxPerMin, 36),
                          }}
                        >
                          Break
                        </div>
                      )}
                    {meetings.map((m) => {
                      const startMin = clockMinutes(m.start);
                      const endMin = clockMinutes(m.end);
                      return (
                        <div
                          key={m.id}
                          className="cal-horizontal-item meeting"
                          style={{
                            left: minutesToOffset(startMin, startMinutes, horizontalPxPerMin),
                            width: Math.max((endMin - startMin) * horizontalPxPerMin, 72),
                          }}
                          title={m.subject}
                        >
                          <div style={{ color: "var(--ink-muted)", fontSize: "0.72rem" }}>
                            {formatTime(m.start)}–{formatTime(m.end)}
                          </div>
                          {m.subject}
                        </div>
                      );
                    })}
                    {blocks.map((b) => {
                      const startMin = clockMinutes(b.start);
                      const endMin = clockMinutes(b.end);
                      return (
                        <Link
                          key={b.id}
                          href={`/tasks/${b.task.id}`}
                          className="cal-horizontal-item task"
                          style={{
                            left: minutesToOffset(startMin, startMinutes, horizontalPxPerMin),
                            width: Math.max((endMin - startMin) * horizontalPxPerMin, 72),
                            borderLeft: `3px solid ${b.task.bucket?.color ?? priorityColor(b.task.priority)}`,
                          }}
                          title={b.task.title}
                        >
                          <div style={{ color: "var(--ink-muted)", fontSize: "0.72rem" }}>
                            {formatTime(b.start)}–{formatTime(b.end)}
                          </div>
                          {b.task.title}
                        </Link>
                      );
                    })}
                    {meetings.length === 0 &&
                      blocks.length === 0 &&
                      !(breakStart != null && breakEnd != null) && (
                        <div style={{ color: "var(--ink-muted)", fontSize: "0.85rem", paddingTop: "1.6rem" }}>
                          Open day
                        </div>
                      )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="cal-vertical">
          {days.map((day) => {
            const { meetings, blocks } = dayContent(day);
            const isToday = startOfDay(day).getTime() === today.getTime();
            return (
              <div
                key={day.toISOString()}
                ref={isToday ? todayRef : undefined}
                className="card cal-vertical-day"
                style={{
                  padding: "0.75rem",
                  outline: isToday ? "2px solid color-mix(in srgb, var(--brand) 35%, transparent)" : undefined,
                }}
              >
                <div style={{ fontWeight: 650, marginBottom: "0.55rem" }}>
                  {format(day, "EEE d")}
                  {isToday ? " · Today" : ""}
                </div>
                <div className="cal-timeline" style={{ height: daySpan * verticalPxPerMin }}>
                  {hours.map((m) => (
                    <div
                      key={m}
                      className="cal-hour-line"
                      style={{ top: minutesToOffset(m, startMinutes, verticalPxPerMin) }}
                    >
                      {String(Math.floor(m / 60)).padStart(2, "0")}:
                      {String(m % 60).padStart(2, "0")}
                    </div>
                  ))}
                  {breakStart != null &&
                    breakEnd != null &&
                    breakEnd > breakStart && (
                      <div
                        className="cal-break"
                        style={{
                          top: minutesToOffset(breakStart, startMinutes, verticalPxPerMin),
                          height: Math.max((breakEnd - breakStart) * verticalPxPerMin, 18),
                        }}
                      >
                        Break
                      </div>
                    )}
                  {meetings.map((m) => {
                    const startMin = clockMinutes(m.start);
                    const endMin = clockMinutes(m.end);
                    return (
                      <div
                        key={m.id}
                        style={{
                          position: "absolute",
                          left: 44,
                          right: 6,
                          top: minutesToOffset(startMin, startMinutes, verticalPxPerMin),
                          height: Math.max((endMin - startMin) * verticalPxPerMin, 22),
                          borderRadius: 8,
                          background: "color-mix(in srgb, var(--ink) 8%, transparent)",
                          fontSize: "0.72rem",
                          padding: "0.25rem 0.4rem",
                          overflow: "hidden",
                        }}
                      >
                        {m.subject}
                      </div>
                    );
                  })}
                  {blocks.map((b) => {
                    const startMin = clockMinutes(b.start);
                    const endMin = clockMinutes(b.end);
                    return (
                      <Link
                        key={b.id}
                        href={`/tasks/${b.task.id}`}
                        style={{
                          position: "absolute",
                          left: 44,
                          right: 6,
                          top: minutesToOffset(startMin, startMinutes, verticalPxPerMin),
                          height: Math.max((endMin - startMin) * verticalPxPerMin, 22),
                          borderRadius: 8,
                          background: "color-mix(in srgb, var(--brand) 16%, transparent)",
                          borderLeft: `3px solid ${b.task.bucket?.color ?? priorityColor(b.task.priority)}`,
                          fontSize: "0.72rem",
                          padding: "0.25rem 0.4rem",
                          overflow: "hidden",
                        }}
                      >
                        {b.task.title}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
