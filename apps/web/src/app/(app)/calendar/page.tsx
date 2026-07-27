"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { addDays, format, startOfDay } from "date-fns";
import { GalleryHorizontal, GalleryVertical, RefreshCw } from "lucide-react";
import { priorityColor } from "@/lib/format";
import {
  useLocalMeetings,
  useLocalPrefs,
  useLocalScheduleBlocks,
} from "@/lib/local/hooks";
import * as repo from "@/lib/local/repo";
import { canSyncRemote, flushOutbox, pullFromServer } from "@/lib/local/sync";

type TimedItem = {
  id: string;
  startMin: number;
  endMin: number;
  kind: "meeting" | "task" | "break";
  title: string;
  href?: string;
  color?: string;
};

/** Pack true time-overlaps into lanes. Sequential tasks stay on one row. */
function assignLanes(items: TimedItem[]): { item: TimedItem; lane: number }[] {
  const sorted = [...items].sort(
    (a, b) => a.startMin - b.startMin || b.endMin - a.endMin
  );
  const laneEnds: number[] = [];
  return sorted.map((item) => {
    let lane = laneEnds.findIndex((end) => end <= item.startMin);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.endMin);
    } else {
      laneEnds[lane] = item.endMin;
    }
    return { item, lane };
  });
}

function minutesToOffset(minutes: number, dayStart: number, pxPerMin: number) {
  return (minutes - dayStart) * pxPerMin;
}

/** Position within the work-hours track as a % of the day span. */
function workHourPercent(minutes: number, dayStart: number, daySpan: number) {
  return ((minutes - dayStart) / daySpan) * 100;
}

function clockMinutes(iso: string) {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

export default function CalendarPage() {
  const blocks = useLocalScheduleBlocks();
  const meetings = useLocalMeetings();
  const prefs = useLocalPrefs();
  const [scheduling, setScheduling] = useState(false);
  const [view, setView] = useState<"horizontal" | "vertical">("horizontal");
  const [viewportH, setViewportH] = useState(800);
  const [nowMinutes, setNowMinutes] = useState(() => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  });
  const todayRef = useRef<HTMLDivElement | null>(null);

  const workDays = prefs?.workDays?.length ? prefs.workDays : [1, 2, 3, 4, 5];
  const planningDays = prefs?.planningDays ?? 14;
  const startMinutes = prefs?.startMinutes ?? 540;
  const endMinutes = prefs?.endMinutes ?? 1020;
  const breakStart = prefs?.breakStartMinutes ?? null;
  const breakEnd = prefs?.breakEndMinutes ?? null;

  const data = useMemo(
    () => ({
      blocks: blocks.map((b) => ({
        id: b.id,
        start: b.start,
        end: b.end,
        task: {
          id: b.task?.id ?? b.taskId,
          title: b.task?.title ?? "Task",
          priority: b.task?.priority ?? 3,
          atRisk: b.task?.atRisk ?? false,
          bucket: b.task?.bucket ?? null,
        },
      })),
      meetings,
      outlookConnected: meetings.length > 0,
    }),
    [blocks, meetings]
  );

  type CalData = typeof data;

  const today = useMemo(() => startOfDay(new Date()), []);

  const days = useMemo(() => {
    const horizon = Math.max(planningDays, 14);
    const candidates = Array.from({ length: horizon + 7 }, (_, i) => addDays(today, i));
    return candidates
      .filter((day) => workDays.includes(day.getDay()))
      .slice(0, Math.max(workDays.length, planningDays));
  }, [today, workDays, planningDays]);

  useEffect(() => {
    const tick = () => {
      const n = new Date();
      setNowMinutes(n.getHours() * 60 + n.getMinutes());
    };
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const update = () => setViewportH(window.innerHeight);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // If tasks exist but nothing is packed yet (e.g. Test Mode offline), pack locally.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const todos = await localDbTasksOpen();
      if (cancelled || !todos) return;
      if (blocks.length > 0) return;
      const { runLocalScheduler } = await import("@/lib/local/scheduler");
      await runLocalScheduler();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll today's column into view once — don't re-run on toolbar clicks or data updates
  // (that was scrolling the page and hiding the Calendar heading).
  const didScrollToToday = useRef(false);
  useEffect(() => {
    if (!days.length || didScrollToToday.current) return;
    const id = window.setTimeout(() => {
      const el = todayRef.current;
      if (!el) return;
      const scroller =
        el.closest<HTMLElement>(".cal-horizontal") ??
        el.closest<HTMLElement>(".cal-vertical-scroll") ??
        null;
      if (scroller && scroller.scrollWidth > scroller.clientWidth) {
        const left = Math.max(0, el.offsetLeft - 12);
        scroller.scrollTo({ left, behavior: "smooth" });
      } else {
        el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
      }
      didScrollToToday.current = true;
    }, 120);
    return () => window.clearTimeout(id);
  }, [days]);

  async function localDbTasksOpen() {
    const { localDb } = await import("@/lib/local/db");
    const count = await localDb.tasks
      .filter((t) => t.status === "TODO" || t.status === "IN_PROGRESS")
      .count();
    return count > 0;
  }

  async function reschedule() {
    setScheduling(true);
    try {
      const { runLocalScheduler } = await import("@/lib/local/scheduler");
      await runLocalScheduler();
      await repo.enqueue({ type: "runScheduler" });
      await flushOutbox();
      if (canSyncRemote()) await pullFromServer();
    } finally {
      setScheduling(false);
    }
  }

  const daySpan = Math.max(endMinutes - startMinutes, 60);
  // Fit vertical timeline in the viewport so the page itself doesn't scroll.
  const verticalPxPerMin = Math.max(0.55, Math.min(1.25, (viewportH - 210) / daySpan));
  const horizontalLaneHeight = 56;
  const horizontalLaneGap = 6;
  const hours = Array.from(
    { length: Math.ceil(daySpan / 60) + 1 },
    (_, i) => startMinutes + i * 60
  ).filter((m) => m <= endMinutes);
  const showNowLine = nowMinutes >= startMinutes && nowMinutes <= endMinutes;

  function dayContent(day: Date) {
    const dayStart = day;
    const dayEnd = addDays(day, 1);
    const meetings =
      data.meetings.filter((m) => {
        if (m.isMomentum) return false;
        const s = new Date(m.start);
        return s >= dayStart && s < dayEnd;
      }) ?? [];
    const blocks =
      data.blocks.filter((b) => {
        const s = new Date(b.start);
        return s >= dayStart && s < dayEnd;
      }) ?? [];
    return { meetings, blocks };
  }

  /** Only items that intersect the configured work-hours window. */
  function dayTimelineItems(
    meetings: CalData["meetings"],
    blocks: CalData["blocks"]
  ): TimedItem[] {
    const items: TimedItem[] = [];
    const pushClipped = (item: TimedItem) => {
      const startMin = Math.max(item.startMin, startMinutes);
      const endMin = Math.min(item.endMin, endMinutes);
      if (endMin <= startMin) return;
      items.push({ ...item, startMin, endMin });
    };

    if (breakStart != null && breakEnd != null && breakEnd > breakStart) {
      pushClipped({
        id: "break",
        startMin: breakStart,
        endMin: breakEnd,
        kind: "break",
        title: "Break",
      });
    }
    for (const m of meetings) {
      pushClipped({
        id: m.id,
        startMin: clockMinutes(m.start),
        endMin: Math.max(clockMinutes(m.end), clockMinutes(m.start) + 15),
        kind: "meeting",
        title: m.subject,
      });
    }
    for (const b of blocks) {
      pushClipped({
        id: b.id,
        startMin: clockMinutes(b.start),
        endMin: Math.max(clockMinutes(b.end), clockMinutes(b.start) + 15),
        kind: "task",
        title: b.task.title,
        href: `/tasks/${b.task.id}`,
        color: b.task.bucket?.color ?? priorityColor(b.task.priority),
      });
    }
    return items;
  }

  return (
    <div className={`page-wrap wide rise ${view === "vertical" ? "cal-page-vertical" : ""}`}>
      <div>
        <div className="cal-page-heading">
          <h1
            style={{
              margin: 0,
              fontFamily: "var(--font-display), serif",
              fontSize: "1.35rem",
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
            }}
          >
            Calendar
          </h1>
          <div className="cal-toolbar">
            <button
              className="btn secondary cal-toolbar-btn"
              title="Horizontal"
              aria-label="Horizontal"
              style={
                view === "horizontal"
                  ? { background: "color-mix(in srgb, var(--brand) 14%, transparent)" }
                  : undefined
              }
              onClick={() => setView("horizontal")}
            >
              <GalleryHorizontal size={16} />
              <span className="cal-toolbar-label">Horizontal</span>
            </button>
            <button
              className="btn secondary cal-toolbar-btn"
              title="Vertical"
              aria-label="Vertical"
              style={
                view === "vertical"
                  ? { background: "color-mix(in srgb, var(--brand) 14%, transparent)" }
                  : undefined
              }
              onClick={() => setView("vertical")}
            >
              <GalleryVertical size={16} />
              <span className="cal-toolbar-label">Vertical</span>
            </button>
            <button
              className="btn secondary cal-toolbar-btn"
              title={scheduling ? "Syncing…" : "Sync & pack"}
              aria-label={scheduling ? "Syncing" : "Sync and pack"}
              onClick={() => void reschedule()}
              disabled={scheduling}
            >
              <RefreshCw size={16} />
              <span className="cal-toolbar-label">{scheduling ? "Syncing…" : "Sync & pack"}</span>
            </button>
          </div>
        </div>
        <p style={{ margin: "0.35rem 0 0", color: "var(--ink-muted)", fontSize: "0.9rem" }}>
          Work hours only · tasks stack when times overlap.
        </p>
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
            const laidOut = assignLanes(dayTimelineItems(meetings, blocks));
            const laneCount = Math.max(1, ...laidOut.map((x) => x.lane + 1), 1);
            const trackHeight = 28 + laneCount * (horizontalLaneHeight + horizontalLaneGap);
            const workLabel = `${String(Math.floor(startMinutes / 60)).padStart(2, "0")}:${String(
              startMinutes % 60
            ).padStart(2, "0")}–${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(
              endMinutes % 60
            ).padStart(2, "0")}`;
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
                <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "center" }}>
                  <strong>{format(day, "EEE d MMM")}</strong>
                  <div style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
                    <span className="badge" style={{ fontWeight: 500 }}>
                      {workLabel}
                    </span>
                    {isToday && <span className="badge">Today</span>}
                  </div>
                </div>
                <div className="cal-horizontal-scroll">
                  <div
                    className="cal-horizontal-track"
                    style={{ width: "100%", height: trackHeight }}
                  >
                    {hours.map((m) => (
                      <div
                        key={m}
                        className="cal-horizontal-hour"
                        style={{ left: `${workHourPercent(m, startMinutes, daySpan)}%` }}
                      >
                        {String(Math.floor(m / 60)).padStart(2, "0")}:
                        {String(m % 60).padStart(2, "0")}
                      </div>
                    ))}
                    {isToday && showNowLine && (
                      <div
                        className="cal-now-line-h"
                        style={{ left: `${workHourPercent(nowMinutes, startMinutes, daySpan)}%` }}
                        title="Now"
                      >
                        <span className="cal-now-dot" />
                      </div>
                    )}
                    {laidOut.map(({ item, lane }) => {
                      const topRem = `${1.55 + lane * ((horizontalLaneHeight + horizontalLaneGap) / 16)}rem`;
                      const heightRem = `${horizontalLaneHeight / 16}rem`;
                      const widthPct = workHourPercent(item.endMin, startMinutes, daySpan) -
                        workHourPercent(item.startMin, startMinutes, daySpan);
                      const short = widthPct < 8;
                      const common = {
                        left: `${workHourPercent(item.startMin, startMinutes, daySpan)}%`,
                        width: `${Math.max(widthPct, 0.8)}%`,
                        top: topRem,
                        height: heightRem,
                        ...(item.kind === "task" && item.color
                          ? { borderLeft: `3px solid ${item.color}` }
                          : {}),
                      } as React.CSSProperties;

                      const timeLabel = `${String(Math.floor(item.startMin / 60)).padStart(2, "0")}:${String(
                        item.startMin % 60
                      ).padStart(2, "0")}–${String(Math.floor(item.endMin / 60)).padStart(2, "0")}:${String(
                        item.endMin % 60
                      ).padStart(2, "0")}`;

                      if (item.kind === "break") {
                        return (
                          <div key={item.id} className="cal-horizontal-break" style={common} title={timeLabel}>
                            Break
                          </div>
                        );
                      }
                      if (item.kind === "meeting") {
                        return (
                          <div
                            key={item.id}
                            className={`cal-horizontal-item meeting${short ? " is-short" : ""}`}
                            style={common}
                            title={`${item.title} · ${timeLabel}`}
                          >
                            {!short && <div className="cal-item-time">{timeLabel}</div>}
                            <div className="cal-item-title">{item.title}</div>
                          </div>
                        );
                      }
                      return (
                        <Link
                          key={item.id}
                          href={item.href!}
                          className={`cal-horizontal-item task${short ? " is-short" : ""}`}
                          style={common}
                          title={`${item.title} · ${timeLabel}`}
                        >
                          {!short && <div className="cal-item-time">{timeLabel}</div>}
                          <div className="cal-item-title">{item.title}</div>
                        </Link>
                      );
                    })}
                    {laidOut.length === 0 && (
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
            const verticalItems = dayTimelineItems(meetings, blocks);
            const laidOut = assignLanes(verticalItems);
            const laneCount = Math.max(1, ...laidOut.map((x) => x.lane + 1), 1);
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
                  {isToday && showNowLine && (
                    <div
                      className="cal-now-line-v"
                      style={{ top: minutesToOffset(nowMinutes, startMinutes, verticalPxPerMin) }}
                      title="Now"
                    >
                      <span className="cal-now-label">Now</span>
                    </div>
                  )}
                  {laidOut.map(({ item, lane }) => {
                    const top = minutesToOffset(item.startMin, startMinutes, verticalPxPerMin);
                    const height = Math.max(
                      (item.endMin - item.startMin) * verticalPxPerMin,
                      22
                    );
                    const gutter = 44;
                    const gap = 3;
                    const usable = `calc(100% - ${gutter}px - ${(laneCount - 1) * gap}px)`;
                    const style: React.CSSProperties = {
                      position: "absolute",
                      top,
                      height,
                      left: `calc(${gutter}px + (${usable}) * ${lane} / ${laneCount} + ${lane * gap}px)`,
                      width: `calc((${usable}) / ${laneCount})`,
                      borderRadius: 8,
                      fontSize: height < 28 ? "0.68rem" : "0.72rem",
                      padding: "0.2rem 0.35rem",
                      overflow: "hidden",
                      lineHeight: 1.25,
                      zIndex: 2 + lane,
                      ...(item.kind === "break"
                        ? {
                            background: "color-mix(in srgb, var(--ink-muted) 12%, transparent)",
                            border: "1px dashed var(--line)",
                            color: "var(--ink-muted)",
                            display: "grid",
                            placeItems: "center",
                          }
                        : item.kind === "meeting"
                          ? { background: "color-mix(in srgb, var(--ink) 8%, transparent)" }
                          : {
                              background: "color-mix(in srgb, var(--brand) 16%, transparent)",
                              borderLeft: `3px solid ${item.color ?? "var(--brand)"}`,
                            }),
                    };

                    const label =
                      height < 28
                        ? item.title
                        : `${String(Math.floor(item.startMin / 60)).padStart(2, "0")}:${String(
                            item.startMin % 60
                          ).padStart(2, "0")} ${item.title}`;

                    if (item.kind === "task") {
                      return (
                        <Link
                          key={item.id}
                          href={item.href!}
                          className="cal-vertical-item"
                          style={style}
                          title={item.title}
                        >
                          <span className="cal-item-title">{label}</span>
                        </Link>
                      );
                    }
                    return (
                      <div key={item.id} className="cal-vertical-item" style={style} title={item.title}>
                        <span className="cal-item-title">{item.kind === "break" ? "Break" : label}</span>
                      </div>
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
