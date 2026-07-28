"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDownWideNarrow, Folders, GripVertical, Plus, RotateCcw } from "lucide-react";
import { formatMinutes, priorityColor } from "@/lib/format";
import { NewTaskModal } from "@/components/NewTaskModal";
import { CreateChooser } from "@/components/CreateChooser";
import { useLocalTasks, useLocalWorkspaces } from "@/lib/local/hooks";
import * as repo from "@/lib/local/repo";
import type { LocalTask } from "@/lib/local/db";
import { flushOutbox, pullFromServer } from "@/lib/local/sync";
import { resolveMediaUrl } from "@/lib/sync-api";

type SortMode = "manual" | "priority" | "bucket";

export default function TasksPage() {
  const workspaces = useLocalWorkspaces();
  const [workspaceId, setWorkspaceId] = useState("");
  const tasks = useLocalTasks(workspaceId);
  const [bucketFilter, setBucketFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [tab, setTab] = useState<"open" | "completed">("open");
  const [sortMode, setSortMode] = useState<SortMode>("manual");
  const [createOpen, setCreateOpen] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [createMode, setCreateMode] = useState<"simple" | "full">("simple");
  const [createVariant, setCreateVariant] = useState<"task" | "event">("task");
  const [ordered, setOrdered] = useState<LocalTask[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const dragOriginIndex = useRef<number | null>(null);
  const listAtDragStart = useRef<LocalTask[]>([]);

  useEffect(() => {
    if (!workspaceId && workspaces[0]?.id) setWorkspaceId(workspaces[0].id);
  }, [workspaces, workspaceId]);

  const current = useMemo(
    () => workspaces.find((w) => w.id === workspaceId),
    [workspaces, workspaceId]
  );
  const members = current?.members ?? [];

  const visible = useMemo(() => {
    const bucketLabel = (t: LocalTask) => {
      if (t.bucket?.name) return t.bucket.name;
      const b = current?.buckets?.find((x) => x.id === t.bucketId);
      return b?.name ?? "\uffff";
    };
    return tasks
      .filter((t) => {
        if (tab === "completed") {
          if (t.status !== "DONE") return false;
        } else if (t.status === "DONE" || t.status === "CANCELLED") {
          return false;
        }
        if (bucketFilter !== "all" && t.bucketId !== bucketFilter) return false;
        if (assigneeFilter !== "all" && t.assigneeId !== assigneeFilter) return false;
        if (priorityFilter !== "all" && t.priority !== Number(priorityFilter)) return false;
        return true;
      })
      .sort((a, b) => {
        if (tab === "completed") {
          const ad = a.completedAt ? new Date(a.completedAt).getTime() : 0;
          const bd = b.completedAt ? new Date(b.completedAt).getTime() : 0;
          return bd - ad;
        }
        if (sortMode === "priority") {
          if (a.priority !== b.priority) return b.priority - a.priority;
          return a.title.localeCompare(b.title);
        }
        if (sortMode === "bucket") {
          const an = bucketLabel(a);
          const bn = bucketLabel(b);
          if (an !== bn) return an.localeCompare(bn);
          if (a.priority !== b.priority) return b.priority - a.priority;
          return a.title.localeCompare(b.title);
        }
        if (a.position !== b.position) return a.position - b.position;
        if (a.priority !== b.priority) return b.priority - a.priority;
        return a.title.localeCompare(b.title);
      });
  }, [tasks, tab, bucketFilter, assigneeFilter, priorityFilter, sortMode, current?.buckets]);

  useEffect(() => {
    if (dragIndex == null) setOrdered(visible);
  }, [visible, dragIndex]);

  async function reopen(taskId: string) {
    await repo.patchLocalTask(taskId, { status: "TODO", completedAt: null }, { status: "TODO" });
    await flushOutbox();
    await pullFromServer();
  }

  function onDragStart(index: number) {
    dragOriginIndex.current = index;
    listAtDragStart.current = ordered;
    setDragIndex(index);
    setOverIndex(index);
  }

  function onDragOver(index: number) {
    if (dragIndex == null || dragIndex === index) return;
    setOverIndex(index);
    setOrdered((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(index, 0, moved);
      setDragIndex(index);
      return next;
    });
  }

  function crossedDifferentPriority(from: number, to: number, start: LocalTask[]) {
    if (from === to) return false;
    const moved = start[from];
    if (!moved) return false;
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    for (let i = lo; i <= hi; i++) {
      if (i === from) continue;
      if (start[i]?.priority !== moved.priority) return true;
    }
    return false;
  }

  async function onDrop() {
    if (dragOriginIndex.current == null && dragIndex == null) return;
    const next = ordered;
    const from = dragOriginIndex.current;
    const to = dragIndex;
    const start = listAtDragStart.current;
    dragOriginIndex.current = null;
    setDragIndex(null);
    setOverIndex(null);

    if (from == null || to == null || from === to) {
      setOrdered(visible);
      return;
    }

    const orderChanged = start.map((t) => t.id).join("|") !== next.map((t) => t.id).join("|");
    if (!orderChanged) {
      setOrdered(visible);
      return;
    }

    const prioritiesDiffer = crossedDifferentPriority(from, to, start);
    const message = prioritiesDiffer
      ? "Save this task order and update priority numbers to match?"
      : "Save this new task order?";

    if (!window.confirm(message)) {
      setOrdered(visible);
      return;
    }

    const applyPriorities = prioritiesDiffer;
    const updates = next.map((t, i) => {
      const priority = applyPriorities
        ? Math.max(1, Math.min(5, 5 - Math.floor((i / Math.max(next.length - 1, 1)) * 4)))
        : t.priority;
      return { id: t.id, priority, position: i };
    });

    for (const u of updates) {
      await repo.patchLocalTask(u.id, { priority: u.priority, position: u.position });
    }
    await fetch("/api/tasks/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates }),
    });
    await flushOutbox();
    await pullFromServer();
  }

  const canReorder = tab === "open" && sortMode === "manual";
  const list = canReorder ? ordered : visible;

  return (
    <div className="page-wrap rise">
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "end", flexWrap: "wrap" }}>
        <div>
          <h1
            style={{
              margin: 0,
              fontFamily: "var(--font-display), serif",
              fontSize: "1.85rem",
            }}
          >
            Tasks
          </h1>
          <p style={{ margin: "0.35rem 0 0", color: "var(--ink-muted)" }}>
            Instant local list — syncs when you save.
            {canReorder ? " Drag the handle to reorder." : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button
            type="button"
            className="btn secondary"
            title="Sort by priority"
            aria-pressed={sortMode === "priority"}
            style={
              sortMode === "priority"
                ? { background: "color-mix(in srgb, var(--brand) 14%, transparent)" }
                : undefined
            }
            onClick={() => setSortMode((m) => (m === "priority" ? "manual" : "priority"))}
          >
            <ArrowDownWideNarrow size={16} /> Priority
          </button>
          <button
            type="button"
            className="btn secondary"
            title="Sort by bucket, then priority"
            aria-pressed={sortMode === "bucket"}
            style={
              sortMode === "bucket"
                ? { background: "color-mix(in srgb, var(--brand) 14%, transparent)" }
                : undefined
            }
            onClick={() => setSortMode((m) => (m === "bucket" ? "manual" : "bucket"))}
          >
            <Folders size={16} /> Buckets
          </button>
          <button
            className="btn"
            onClick={() => setChooserOpen(true)}
          >
            <Plus size={16} /> New
          </button>
        </div>
      </div>

      <div className="filter-bar">
        <button
          className="btn secondary compact"
          style={tab === "open" ? { background: "color-mix(in srgb, var(--brand) 14%, transparent)" } : undefined}
          onClick={() => setTab("open")}
        >
          Open
        </button>
        <button
          className="btn secondary compact"
          style={
            tab === "completed" ? { background: "color-mix(in srgb, var(--brand) 14%, transparent)" } : undefined
          }
          onClick={() => setTab("completed")}
        >
          Completed
        </button>
        <select
          className="field"
          value={workspaceId}
          onChange={(e) => setWorkspaceId(e.target.value)}
        >
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <select
          className="field"
          value={assigneeFilter}
          onChange={(e) => setAssigneeFilter(e.target.value)}
        >
          <option value="all">All assignees</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name ?? m.email}
            </option>
          ))}
        </select>
        <select
          className="field"
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
        >
          <option value="all">All priorities</option>
          {[5, 4, 3, 2, 1].map((p) => (
            <option key={p} value={p}>
              Priority {p}
            </option>
          ))}
        </select>
        <button
          className="btn secondary compact"
          style={bucketFilter === "all" ? { background: "color-mix(in srgb, var(--brand) 12%, transparent)" } : undefined}
          onClick={() => setBucketFilter("all")}
        >
          All buckets
        </button>
        {current?.buckets.map((b) => (
          <button
            key={b.id}
            className="btn secondary compact"
            style={
              bucketFilter === b.id
                ? {
                    background: "color-mix(in srgb, var(--brand) 12%, transparent)",
                    borderColor: b.color,
                  }
                : undefined
            }
            onClick={() => setBucketFilter(b.id)}
          >
            <span className="bucket-swatch" style={{ background: b.color }} />
            {b.name}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gap: "0.55rem" }}>
        {list.length === 0 ? (
          <p style={{ color: "var(--ink-muted)" }}>No tasks match these filters.</p>
        ) : (
          list.map((t, i) => {
            const fadeColor = t.bucket?.color ?? priorityColor(t.priority);
            const mediaSrc = t.headerImageUrl ? resolveMediaUrl(t.headerImageUrl) : null;
            return (
            <div
              key={t.id}
              className={`card task-fade-card ${
                dragIndex === i ? "drag-ghost" : overIndex === i && dragIndex != null ? "dragging-item" : ""
              }`}
              data-has-header={mediaSrc ? "true" : undefined}
              onDragOver={
                canReorder
                  ? (e) => {
                      e.preventDefault();
                      onDragOver(i);
                    }
                  : undefined
              }
              style={
                {
                  padding: "0.85rem 1rem",
                  display: "grid",
                  gridTemplateColumns: canReorder ? "28px 1fr auto" : "1fr auto",
                  gap: "0.75rem",
                  alignItems: "center",
                  borderLeft: t.bucket ? `4px solid ${t.bucket.color}` : undefined,
                  transition: "transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease",
                  ["--fade-color" as string]: fadeColor,
                  ["--fade-image" as string]: mediaSrc ? `url("${mediaSrc}")` : undefined,
                } as React.CSSProperties
              }
            >
              {canReorder ? (
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
              ) : null}
              <Link href={`/tasks/${t.id}`} style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                  <span className="priority-dot" style={{ background: priorityColor(t.priority) }} />
                  <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.emoji ? `${t.emoji} ` : ""}
                    {t.title}
                  </strong>
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--ink-muted)", marginTop: "0.2rem" }}>
                  P{t.priority} · {formatMinutes(t.estimateMinutes)}
                  {t.bucket ? ` · ${t.bucket.name}` : ""}
                  {t.status === "IN_PROGRESS" ? " · in progress" : ""}
                </div>
              </Link>
              {tab === "completed" ? (
                <button className="btn secondary" onClick={() => void reopen(t.id)} title="Reopen">
                  <RotateCcw size={16} />
                </button>
              ) : null}
            </div>
            );
          })
        )}
      </div>

      <CreateChooser
        open={chooserOpen}
        onClose={() => setChooserOpen(false)}
        onPickTask={() => {
          setCreateVariant("task");
          setCreateMode("simple");
          setCreateOpen(true);
        }}
        onPickEvent={() => {
          setCreateVariant("event");
          setCreateMode("full");
          setCreateOpen(true);
        }}
      />
      <NewTaskModal
        open={createOpen}
        initialMode={createMode}
        variant={createVariant}
        onClose={() => {
          setCreateOpen(false);
          void pullFromServer();
        }}
      />
    </div>
  );
}
