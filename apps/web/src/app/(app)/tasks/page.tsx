"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, RotateCcw } from "lucide-react";
import { formatMinutes, priorityColor } from "@/lib/format";
import { NewTaskModal } from "@/components/NewTaskModal";
import { useLocalTasks, useLocalWorkspaces } from "@/lib/local/hooks";
import * as repo from "@/lib/local/repo";
import { flushOutbox, pullFromServer } from "@/lib/local/sync";

export default function TasksPage() {
  const workspaces = useLocalWorkspaces();
  const [workspaceId, setWorkspaceId] = useState("");
  const tasks = useLocalTasks(workspaceId);
  const [bucketFilter, setBucketFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [tab, setTab] = useState<"open" | "completed">("open");
  const [createOpen, setCreateOpen] = useState(false);
  const [createMode, setCreateMode] = useState<"simple" | "full">("simple");

  useEffect(() => {
    if (!workspaceId && workspaces[0]?.id) setWorkspaceId(workspaces[0].id);
  }, [workspaces, workspaceId]);

  const current = useMemo(
    () => workspaces.find((w) => w.id === workspaceId),
    [workspaces, workspaceId]
  );
  const members = current?.members ?? [];

  async function reopen(taskId: string) {
    await repo.patchLocalTask(taskId, { status: "TODO", completedAt: null }, { status: "TODO" });
    await flushOutbox();
    await pullFromServer();
  }

  const visible = tasks.filter((t) => {
    if (tab === "completed") {
      if (t.status !== "DONE") return false;
    } else if (t.status === "DONE" || t.status === "CANCELLED") {
      return false;
    }
    if (bucketFilter !== "all" && t.bucketId !== bucketFilter) return false;
    if (assigneeFilter !== "all" && t.assigneeId !== assigneeFilter) return false;
    if (priorityFilter !== "all" && t.priority !== Number(priorityFilter)) return false;
    return true;
  });

  return (
    <div className="page-wrap rise">
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "end" }}>
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
          </p>
        </div>
        <button
          className="btn"
          onClick={() => {
            setCreateMode("simple");
            setCreateOpen(true);
          }}
        >
          <Plus size={16} /> New
        </button>
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
        {visible.length === 0 ? (
          <p style={{ color: "var(--ink-muted)" }}>No tasks match these filters.</p>
        ) : (
          visible.map((t) => (
            <div
              key={t.id}
              className="card"
              style={{
                padding: "0.85rem 1rem",
                display: "grid",
                gridTemplateColumns: t.headerImageUrl ? "72px 1fr auto" : "1fr auto",
                gap: "0.75rem",
                alignItems: "center",
                borderLeft: t.bucket ? `4px solid ${t.bucket.color}` : undefined,
              }}
            >
              {t.headerImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={t.headerImageUrl}
                  alt=""
                  style={{ width: 72, height: 52, objectFit: "cover", borderRadius: 8 }}
                />
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
          ))
        )}
      </div>

      <NewTaskModal
        open={createOpen}
        initialMode={createMode}
        onClose={() => {
          setCreateOpen(false);
          void pullFromServer();
        }}
      />
    </div>
  );
}
