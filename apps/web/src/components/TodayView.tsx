"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, RefreshCw, TriangleAlert } from "lucide-react";
import { format } from "date-fns";
import { formatMinutes, formatTime, priorityColor } from "@/lib/format";
import { useLocalToday } from "@/lib/local/hooks";
import * as repo from "@/lib/local/repo";
import { flushOutbox } from "@/lib/local/sync";

export function TodayView() {
  const { blocks: liveBlocks, backlog, atRisk } = useLocalToday();
  const [scheduling, setScheduling] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);

  useEffect(() => {
    void import("@/lib/local/widget-sync")
      .then((m) => m.syncHomeWidget(liveBlocks))
      .catch(() => undefined);
  }, [liveBlocks]);

  async function reschedule() {
    setScheduling(true);
    try {
      const { runLocalScheduler } = await import("@/lib/local/scheduler");
      await runLocalScheduler();
      await repo.enqueue({ type: "runScheduler" });
      await flushOutbox();
      const { canSyncRemote, pullFromServer } = await import("@/lib/local/sync");
      if (canSyncRemote()) await pullFromServer();
    } finally {
      setScheduling(false);
    }
  }

  async function complete(taskId: string) {
    setCompletingId(taskId);
    await repo.patchLocalTask(
      taskId,
      { status: "DONE", completedAt: new Date().toISOString() },
      { status: "DONE" }
    );
    window.setTimeout(async () => {
      await flushOutbox();
      const { pullFromServer } = await import("@/lib/local/sync");
      await pullFromServer();
      void import("@/lib/local/widget-sync").then((m) => m.syncHomeWidget());
      setCompletingId(null);
    }, 400);
  }

  return (
    <div className="page-wrap rise">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: "1rem" }}>
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: "0.75rem",
              flexWrap: "wrap",
            }}
          >
            <h1
              style={{
                margin: 0,
                fontFamily: "var(--font-display), serif",
                fontSize: "1.85rem",
                letterSpacing: "-0.02em",
              }}
            >
              Today
            </h1>
            <span
              style={{
                color: "var(--ink-muted)",
                fontSize: "1rem",
                fontWeight: 500,
              }}
            >
              {format(new Date(), "EEEE, d MMMM")}
            </span>
          </div>
          <p style={{ margin: "0.35rem 0 0", color: "var(--ink-muted)" }}>
            Local-first — changes save to this device, then sync to the cloud.
          </p>
        </div>
        <button className="btn secondary" onClick={() => void reschedule()} disabled={scheduling}>
          <RefreshCw size={16} />
          {scheduling ? "Packing…" : "Reschedule"}
        </button>
      </div>

      {atRisk.length > 0 && (
        <section
          className="card"
          style={{ padding: "1rem", borderColor: "color-mix(in srgb, var(--danger) 35%, var(--line))" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
            <TriangleAlert size={18} color="var(--danger)" />
            <strong>Due soon</strong>
          </div>
          <div style={{ display: "grid", gap: "0.5rem" }}>
            {atRisk.map((t) => (
              <Link
                key={t.id}
                href={`/tasks/${t.id}`}
                style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}
              >
                <span className="priority-dot" style={{ background: priorityColor(t.priority) }} />
                {t.bucket && <span className="bucket-swatch" style={{ background: t.bucket.color }} />}
                <span style={{ flex: 1 }}>{t.title}</span>
                <span className="badge risk">needs an earlier slot</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="card" style={{ padding: "1rem" }}>
        <h2 style={{ margin: "0 0 0.85rem", fontSize: "1rem" }}>Agenda</h2>
        {liveBlocks.length === 0 ? (
          <p style={{ color: "var(--ink-muted)", margin: 0 }}>
            Nothing scheduled yet. Add tasks with estimates, then hit Reschedule.
          </p>
        ) : (
          <div style={{ display: "grid", gap: "0.65rem" }}>
            {liveBlocks.map((b, i) => (
              <div
                key={b.id}
                className={completingId === b.task?.id ? "completing" : "rise"}
                style={{
                  display: "grid",
                  gridTemplateColumns: "72px 1fr auto",
                  gap: "0.75rem",
                  alignItems: "center",
                  padding: "0.75rem",
                  borderRadius: "12px",
                  background: "color-mix(in srgb, var(--bg-elevated) 70%, transparent)",
                  borderLeft: b.task?.bucket
                    ? `4px solid ${b.task.bucket.color}`
                    : "4px solid transparent",
                  animationDelay: `${i * 40}ms`,
                }}
              >
                <div style={{ fontSize: "0.8rem", color: "var(--ink-muted)", lineHeight: 1.35 }}>
                  <div>{formatTime(b.start)}</div>
                  <div>{formatTime(b.end)}</div>
                </div>
                <Link href={`/tasks/${b.task!.id}`}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                    <span
                      className="priority-dot"
                      style={{ background: priorityColor(b.task?.priority ?? 3) }}
                    />
                    <strong>
                      {b.task?.emoji ? `${b.task.emoji} ` : ""}
                      {b.task?.title}
                    </strong>
                    {b.task?.atRisk && <span className="badge risk">due pressure</span>}
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "var(--ink-muted)", marginTop: "0.2rem" }}>
                    {formatMinutes(b.task?.estimateMinutes ?? 0)}
                    {b.task?.bucket ? ` · ${b.task.bucket.name}` : ""} · P{b.task?.priority}
                  </div>
                </Link>
                <button
                  className="btn ghost"
                  title="Complete"
                  onClick={() => void complete(b.task!.id)}
                  disabled={completingId === b.task?.id}
                >
                  <Check size={18} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card" style={{ padding: "1rem" }}>
        <h2 style={{ margin: "0 0 0.85rem", fontSize: "1rem" }}>Unscheduled backlog</h2>
        {backlog.length === 0 ? (
          <p style={{ color: "var(--ink-muted)", margin: 0 }}>All open tasks have a slot.</p>
        ) : (
          <div style={{ display: "grid", gap: "0.5rem" }}>
            {backlog.map((t) => (
              <Link
                key={t.id}
                href={`/tasks/${t.id}`}
                style={{
                  display: "flex",
                  gap: "0.6rem",
                  alignItems: "center",
                  padding: "0.55rem 0.35rem",
                }}
              >
                <span className="priority-dot" style={{ background: priorityColor(t.priority) }} />
                {t.bucket && <span className="bucket-swatch" style={{ background: t.bucket.color }} />}
                <span style={{ flex: 1 }}>
                  {t.emoji ? `${t.emoji} ` : ""}
                  {t.title}
                </span>
                <span style={{ color: "var(--ink-muted)", fontSize: "0.8rem" }}>
                  {formatMinutes(t.estimateMinutes)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
