import { useState } from "react";
import { Check, RefreshCw, TriangleAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { formatMinutes, formatTime, priorityColor } from "@/lib/format";
import { useLocalToday } from "@/lib/local/hooks";
import * as repo from "@/lib/local/repo";
import { flushOutbox, pullFromServer } from "@/lib/local/sync";

export function TodayPage() {
  const { blocks, backlog, atRisk } = useLocalToday();
  const [scheduling, setScheduling] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);

  async function reschedule() {
    setScheduling(true);
    await repo.enqueue({ type: "runScheduler" });
    await flushOutbox();
    await pullFromServer();
    setScheduling(false);
  }

  async function complete(taskId: string) {
    setCompletingId(taskId);
    await repo.patchLocalTask(
      taskId,
      { status: "DONE", completedAt: new Date().toISOString() },
      { status: "DONE" }
    );
    await flushOutbox();
    await pullFromServer();
    setCompletingId(null);
  }

  return (
    <div className="page">
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "end" }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "1.75rem" }}>Today</h1>
          <p style={{ margin: "0.3rem 0 0", color: "var(--ink-muted)" }}>Local agenda on this device</p>
        </div>
        <button className="btn secondary" onClick={() => void reschedule()} disabled={scheduling}>
          <RefreshCw size={16} />
          {scheduling ? "Packing…" : "Reschedule"}
        </button>
      </div>

      {atRisk.length > 0 && (
        <section className="card" style={{ padding: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.65rem" }}>
            <TriangleAlert size={18} color="var(--danger)" />
            <strong>Due soon</strong>
          </div>
          {atRisk.map((t) => (
            <div key={t.id} style={{ display: "flex", gap: "0.5rem", alignItems: "center", padding: "0.35rem 0" }}>
              <span className="priority-dot" style={{ background: priorityColor(t.priority) }} />
              <span style={{ flex: 1 }}>{t.title}</span>
              <span className="badge risk">pressure</span>
            </div>
          ))}
        </section>
      )}

      <section className="card" style={{ padding: "1rem", display: "grid", gap: "0.55rem" }}>
        <h2 style={{ margin: 0, fontSize: "1rem" }}>Agenda</h2>
        {blocks.length === 0 ? (
          <p style={{ margin: 0, color: "var(--ink-muted)" }}>Nothing scheduled yet.</p>
        ) : (
          blocks.map((b) => (
            <div
              key={b.id}
              style={{
                display: "grid",
                gridTemplateColumns: "64px 1fr auto",
                gap: "0.65rem",
                alignItems: "center",
                padding: "0.65rem",
                borderRadius: 12,
                background: "color-mix(in srgb, var(--bg-elevated) 70%, transparent)",
              }}
            >
              <div style={{ fontSize: "0.78rem", color: "var(--ink-muted)" }}>
                <div>{formatTime(b.start)}</div>
                <div>{formatTime(b.end)}</div>
              </div>
              <div>
                <strong>
                  {b.task?.emoji ? `${b.task.emoji} ` : ""}
                  {b.task?.title}
                </strong>
                <div style={{ fontSize: "0.8rem", color: "var(--ink-muted)" }}>
                  {formatMinutes(b.task?.estimateMinutes ?? 0)} · P{b.task?.priority}
                </div>
              </div>
              <button
                className="btn ghost"
                disabled={completingId === b.task?.id}
                onClick={() => b.task && void complete(b.task.id)}
              >
                <Check size={18} />
              </button>
            </div>
          ))
        )}
      </section>

      <section className="card" style={{ padding: "1rem", display: "grid", gap: "0.45rem" }}>
        <h2 style={{ margin: 0, fontSize: "1rem" }}>Backlog</h2>
        {backlog.length === 0 ? (
          <p style={{ margin: 0, color: "var(--ink-muted)" }}>All open tasks have a slot.</p>
        ) : (
          backlog.map((t) => (
            <Link key={t.id} to="/tasks" style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <span className="priority-dot" style={{ background: priorityColor(t.priority) }} />
              <span style={{ flex: 1 }}>{t.title}</span>
              <span style={{ color: "var(--ink-muted)", fontSize: "0.8rem" }}>
                {formatMinutes(t.estimateMinutes)}
              </span>
            </Link>
          ))
        )}
      </section>
    </div>
  );
}
