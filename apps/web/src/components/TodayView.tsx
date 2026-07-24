"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, RefreshCw, TriangleAlert } from "lucide-react";
import { formatMinutes, formatTime, priorityColor } from "@/lib/format";

type Block = {
  id: string;
  start: string;
  end: string;
  task: {
    id: string;
    title: string;
    priority: number;
    atRisk: boolean;
    estimateMinutes: number;
    bucket?: { name: string; color: string } | null;
  };
};

type Task = {
  id: string;
  title: string;
  priority: number;
  atRisk: boolean;
  estimateMinutes: number;
  bucket?: { name: string; color: string } | null;
};

export function TodayView() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [backlog, setBacklog] = useState<Task[]>([]);
  const [atRisk, setAtRisk] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [scheduling, setScheduling] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/today");
    if (!res.ok) return;
    const data = await res.json();
    setBlocks(data.blocks);
    setBacklog(data.backlog);
    setAtRisk(data.atRisk);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(async () => {
      const poll = await fetch("/api/schedule/poll", { method: "POST" });
      if (poll.ok) {
        const { shouldReschedule } = await poll.json();
        if (shouldReschedule) {
          await fetch("/api/schedule/run", { method: "POST" });
          await load();
        }
      }
    }, 180_000);
    return () => clearInterval(id);
  }, [load]);

  async function reschedule() {
    setScheduling(true);
    await fetch("/api/schedule/run", { method: "POST" });
    await load();
    setScheduling(false);
  }

  async function complete(taskId: string) {
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "DONE" }),
    });
    await load();
  }

  if (loading) {
    return <p style={{ color: "var(--ink-muted)" }}>Loading today’s plan…</p>;
  }

  return (
    <div className="rise" style={{ display: "grid", gap: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: "1rem" }}>
        <div>
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
          <p style={{ margin: "0.35rem 0 0", color: "var(--ink-muted)" }}>
            Scheduled focus blocks and anything still waiting for a slot.
          </p>
        </div>
        <button className="btn secondary" onClick={reschedule} disabled={scheduling}>
          <RefreshCw size={16} />
          {scheduling ? "Packing…" : "Reschedule"}
        </button>
      </div>

      {atRisk.length > 0 && (
        <section className="card" style={{ padding: "1rem", borderColor: "rgba(163,59,45,0.35)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
            <TriangleAlert size={18} color="var(--danger)" />
            <strong>At risk</strong>
          </div>
          <div style={{ display: "grid", gap: "0.5rem" }}>
            {atRisk.map((t) => (
              <Link key={t.id} href={`/tasks/${t.id}`} style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}>
                <span className="priority-dot" style={{ background: priorityColor(t.priority) }} />
                <span style={{ flex: 1 }}>{t.title}</span>
                <span className="badge risk">won’t fit before due</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="card" style={{ padding: "1rem" }}>
        <h2 style={{ margin: "0 0 0.85rem", fontSize: "1rem" }}>Agenda</h2>
        {blocks.length === 0 ? (
          <p style={{ color: "var(--ink-muted)", margin: 0 }}>
            Nothing scheduled yet. Add tasks with estimates, then hit Reschedule.
          </p>
        ) : (
          <div style={{ display: "grid", gap: "0.65rem" }}>
            {blocks.map((b, i) => (
              <div
                key={b.id}
                className="rise"
                style={{
                  display: "grid",
                  gridTemplateColumns: "72px 1fr auto",
                  gap: "0.75rem",
                  alignItems: "center",
                  padding: "0.75rem",
                  borderRadius: "12px",
                  background: "rgba(255,255,255,0.55)",
                  animationDelay: `${i * 40}ms`,
                }}
              >
                <div style={{ fontSize: "0.8rem", color: "var(--ink-muted)", lineHeight: 1.35 }}>
                  <div>{formatTime(b.start)}</div>
                  <div>{formatTime(b.end)}</div>
                </div>
                <Link href={`/tasks/${b.task.id}`}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                    <span className="priority-dot" style={{ background: priorityColor(b.task.priority) }} />
                    <strong>{b.task.title}</strong>
                    {b.task.atRisk && <span className="badge risk">at risk</span>}
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "var(--ink-muted)", marginTop: "0.2rem" }}>
                    {formatMinutes(b.task.estimateMinutes)}
                    {b.task.bucket ? ` · ${b.task.bucket.name}` : ""}
                  </div>
                </Link>
                <button className="btn ghost" title="Complete" onClick={() => complete(b.task.id)}>
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
                <span style={{ flex: 1 }}>{t.title}</span>
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
