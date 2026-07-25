"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, GripVertical, RefreshCw, TriangleAlert } from "lucide-react";
import { formatMinutes, formatTime, priorityColor } from "@/lib/format";
import { useLocalToday } from "@/lib/local/hooks";
import * as repo from "@/lib/local/repo";
import { flushOutbox, pullFromServer } from "@/lib/local/sync";

export function TodayView() {
  const { blocks: liveBlocks, backlog, atRisk } = useLocalToday();
  const [blocks, setBlocks] = useState(liveBlocks);
  const [scheduling, setScheduling] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const dragOriginIndex = useRef<number | null>(null);
  const blocksAtDragStart = useRef(liveBlocks);

  useEffect(() => {
    if (dragIndex == null) setBlocks(liveBlocks);
  }, [liveBlocks, dragIndex]);

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
    window.setTimeout(async () => {
      await flushOutbox();
      await pullFromServer();
      setCompletingId(null);
    }, 400);
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

  function crossedDifferentPriority(from: number, to: number, start: typeof blocks) {
    if (from === to) return false;
    const moved = start[from];
    if (!moved) return false;
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    for (let i = lo; i <= hi; i++) {
      if (i === from) continue;
      if (start[i]?.task?.priority !== moved.task?.priority) return true;
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
      setBlocks(liveBlocks);
      return;
    }

    const orderChanged =
      start.map((b) => b.id).join("|") !== next.map((b) => b.id).join("|");
    if (!orderChanged) {
      setBlocks(liveBlocks);
      return;
    }

    const prioritiesDiffer = crossedDifferentPriority(from, to, start);
    const message = prioritiesDiffer
      ? "Save this agenda order and update priority numbers to match?"
      : "Save this new agenda order?";

    if (!window.confirm(message)) {
      setBlocks(liveBlocks);
      return;
    }

    const applyPriorities = prioritiesDiffer;
    const updates = next.map((b, i) => {
      const priority = applyPriorities
        ? Math.max(1, Math.min(5, 5 - Math.floor((i / Math.max(next.length - 1, 1)) * 4)))
        : (b.task?.priority ?? 3);
      return { id: b.task!.id, priority, position: i };
    });

    for (const u of updates) {
      await repo.patchLocalTask(u.id, { priority: u.priority, position: u.position });
    }
    await fetch("/api/tasks/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates }),
    });
    await pullFromServer();
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
        {blocks.length === 0 ? (
          <p style={{ color: "var(--ink-muted)", margin: 0 }}>
            Nothing scheduled yet. Add tasks with estimates, then hit Reschedule.
          </p>
        ) : (
          <div style={{ display: "grid", gap: "0.65rem" }}>
            {blocks.map((b, i) => (
              <div
                key={b.id}
                className={`${completingId === b.task?.id ? "completing" : "rise"} ${
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
                  borderLeft: b.task?.bucket
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
