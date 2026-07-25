"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, GripVertical, RefreshCw, TriangleAlert } from "lucide-react";
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
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const dragOriginIndex = useRef<number | null>(null);
  const blocksAtDragStart = useRef<Block[]>([]);

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
      await fetch("/api/schedule/run", { method: "POST" });
      await load();
    }, 300_000);
    return () => clearInterval(id);
  }, [load]);

  async function reschedule() {
    setScheduling(true);
    await fetch("/api/schedule/run", { method: "POST" });
    await load();
    setScheduling(false);
  }

  async function complete(taskId: string) {
    setCompletingId(taskId);
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "DONE" }),
    });
    window.setTimeout(async () => {
      await load();
      setCompletingId(null);
    }, 850);
  }

  function onDragStart(index: number) {
    dragOriginIndex.current = index;
    blocksAtDragStart.current = blocks;
    setDragIndex(index);
    setOverIndex(index);
  }

  function onDragOver(index: number) {
    if (dragIndex == null || dragIndex === index) return;
    setOverIndex(index);
    setBlocks((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(index, 0, moved);
      setDragIndex(index);
      return next;
    });
  }

  function crossedDifferentPriority(from: number, to: number, start: Block[]) {
    if (from === to) return false;
    const moved = start[from];
    if (!moved) return false;
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    for (let i = lo; i <= hi; i++) {
      if (i === from) continue;
      if (start[i]?.task.priority !== moved.task.priority) return true;
    }
    return false;
  }

  async function onDrop() {
    if (dragOriginIndex.current == null && dragIndex == null) return;
    const next = blocks;
    const from = dragOriginIndex.current;
    const to = dragIndex;
    const start = blocksAtDragStart.current;
    dragOriginIndex.current = null;
    setDragIndex(null);
    setOverIndex(null);

    if (from == null || to == null || from === to) {
      await load();
      return;
    }

    const orderChanged =
      start.map((b) => b.id).join("|") !== next.map((b) => b.id).join("|");
    if (!orderChanged) {
      await load();
      return;
    }

    const prioritiesDiffer = crossedDifferentPriority(from, to, start);
    const message = prioritiesDiffer
      ? "Save this agenda order and update priority numbers to match?"
      : "Save this new agenda order?";

    if (!window.confirm(message)) {
      await load();
      return;
    }

    const applyPriorities = prioritiesDiffer;
    const updates = next.map((b, i) => {
      const priority = applyPriorities
        ? Math.max(1, Math.min(5, 5 - Math.floor((i / Math.max(next.length - 1, 1)) * 4)))
        : b.task.priority;
      return { id: b.task.id, priority, position: i };
    });

    await fetch("/api/tasks/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates }),
    });
    await load();
  }

  if (loading) {
    return <p style={{ color: "var(--ink-muted)" }}>Loading today’s plan…</p>;
  }

  return (
    <div className="page-wrap rise">
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
            Drag by the grip handle (⋮⋮) to reorder — you’ll get a confirmation before it saves.
          </p>
        </div>
        <button className="btn secondary" onClick={reschedule} disabled={scheduling}>
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
        {blocks.length === 0 ? (
          <p style={{ color: "var(--ink-muted)", margin: 0 }}>
            Nothing scheduled yet. Add tasks with estimates, then hit Reschedule.
          </p>
        ) : (
          <div style={{ display: "grid", gap: "0.65rem" }}>
            {blocks.map((b, i) => (
              <div
                key={b.id}
                className={`${completingId === b.task.id ? "completing" : "rise"} ${
                  dragIndex === i ? "drag-ghost" : overIndex === i && dragIndex != null ? "dragging-item" : ""
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  onDragOver(i);
                }}
                style={{
                  display: "grid",
                  gridTemplateColumns: "28px 72px 1fr auto",
                  gap: "0.75rem",
                  alignItems: "center",
                  padding: "0.75rem",
                  borderRadius: "12px",
                  background: "color-mix(in srgb, var(--bg-elevated) 70%, transparent)",
                  borderLeft: b.task.bucket
                    ? `4px solid ${b.task.bucket.color}`
                    : "4px solid transparent",
                  animationDelay: `${i * 40}ms`,
                  transition: "transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease",
                }}
              >
                <span
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    onDragStart(i);
                  }}
                  onDragEnd={() => void onDrop()}
                  title="Drag to reorder"
                  style={{
                    display: "grid",
                    placeItems: "center",
                    cursor: "grab",
                    touchAction: "none",
                    padding: "0.25rem",
                  }}
                >
                  <GripVertical size={16} color="var(--ink-muted)" />
                </span>
                <div style={{ fontSize: "0.8rem", color: "var(--ink-muted)", lineHeight: 1.35 }}>
                  <div>{formatTime(b.start)}</div>
                  <div>{formatTime(b.end)}</div>
                </div>
                <Link href={`/tasks/${b.task.id}`}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                    <span className="priority-dot" style={{ background: priorityColor(b.task.priority) }} />
                    <strong>{b.task.title}</strong>
                    {b.task.atRisk && <span className="badge risk">due pressure</span>}
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "var(--ink-muted)", marginTop: "0.2rem" }}>
                    {formatMinutes(b.task.estimateMinutes)}
                    {b.task.bucket ? ` · ${b.task.bucket.name}` : ""} · {b.task.priority}
                  </div>
                </Link>
                <button
                  className="btn ghost"
                  title="Complete"
                  onClick={() => complete(b.task.id)}
                  disabled={completingId === b.task.id}
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
