"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, RotateCcw } from "lucide-react";
import { formatMinutes, priorityColor } from "@/lib/format";
import { NewTaskModal } from "@/components/NewTaskModal";

type Workspace = {
  id: string;
  name: string;
  buckets: { id: string; name: string; color: string }[];
};

type Member = { id: string; name: string | null; email: string };

type Task = {
  id: string;
  title: string;
  priority: number;
  estimateMinutes: number;
  status: string;
  dueAt?: string | null;
  atRisk: boolean;
  locked: boolean;
  bucketId?: string | null;
  assigneeId?: string | null;
  headerImageKey?: string | null;
  headerImageUrl?: string | null;
  bucket?: { id: string; name: string; color: string } | null;
  assignee?: { id: string; name: string | null; email: string } | null;
  completedAt?: string | null;
  _count?: { comments: number; attachments: number };
};

export default function TasksPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string>("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [bucketFilter, setBucketFilter] = useState<string>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [tab, setTab] = useState<"open" | "completed">("open");
  const [createOpen, setCreateOpen] = useState(false);
  const [createMode, setCreateMode] = useState<"simple" | "full">("simple");

  const current = useMemo(
    () => workspaces.find((w) => w.id === workspaceId),
    [workspaces, workspaceId]
  );

  const load = useCallback(async () => {
    const ws = await fetch("/api/workspaces").then((r) => r.json());
    setWorkspaces(ws.workspaces);
    const wid = workspaceId || ws.workspaces[0]?.id;
    if (!wid) return;
    if (!workspaceId) setWorkspaceId(wid);
    const [data, detail] = await Promise.all([
      fetch(`/api/tasks?${new URLSearchParams({ workspaceId: wid })}`).then((r) => r.json()),
      fetch(`/api/workspaces/${wid}`).then((r) => r.json()),
    ]);
    setTasks(data.tasks);
    setMembers(detail.workspace?.members?.map((m: { user: Member }) => m.user) ?? []);
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function reopen(taskId: string) {
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "TODO" }),
    });
    await load();
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
            Filter by bucket, assignee, and priority.
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

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button
          className="btn secondary"
          style={tab === "open" ? { background: "color-mix(in srgb, var(--brand) 14%, transparent)" } : undefined}
          onClick={() => setTab("open")}
        >
          Open
        </button>
        <button
          className="btn secondary"
          style={
            tab === "completed" ? { background: "color-mix(in srgb, var(--brand) 14%, transparent)" } : undefined
          }
          onClick={() => setTab("completed")}
        >
          Completed
        </button>
        <select
          className="field"
          style={{ width: "auto" }}
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
          style={{ width: "auto" }}
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
          style={{ width: "auto" }}
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
          className="btn secondary"
          style={bucketFilter === "all" ? { background: "color-mix(in srgb, var(--brand) 12%, transparent)" } : undefined}
          onClick={() => setBucketFilter("all")}
        >
          All buckets
        </button>
        {current?.buckets.map((b) => (
          <button
            key={b.id}
            className="btn secondary"
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
        {visible.map((t) => (
          <div
            key={t.id}
            className="card task-fade-card"
            data-has-header={t.headerImageUrl ? "true" : undefined}
            style={
              {
                padding: "0.9rem 1rem",
                display: "grid",
                gridTemplateColumns: tab === "completed" ? "auto 1fr auto auto" : "auto 1fr auto",
                gap: "0.75rem",
                alignItems: "center",
                borderLeft: t.bucket ? `4px solid ${t.bucket.color}` : undefined,
                ["--fade-color" as string]: t.bucket?.color ?? priorityColor(t.priority),
                ...(t.headerImageUrl
                  ? { ["--fade-image" as string]: `url(${t.headerImageUrl})` }
                  : {}),
              } as React.CSSProperties
            }
          >
            <span className="priority-dot" style={{ background: priorityColor(t.priority) }} />
            <Link href={`/tasks/${t.id}`} style={{ position: "relative", zIndex: 1 }}>
              <div style={{ fontWeight: 600 }}>{t.title}</div>
              <div style={{ fontSize: "0.8rem", color: "var(--ink-muted)", marginTop: "0.2rem" }}>
                {t.priority} · {formatMinutes(t.estimateMinutes)}
                {t.bucket ? ` · ${t.bucket.name}` : ""}
                {t.assignee ? ` · ${t.assignee.name ?? t.assignee.email}` : ""}
                {t._count?.comments ? ` · ${t._count.comments} comments` : ""}
              </div>
            </Link>
            <div style={{ display: "flex", gap: "0.35rem", position: "relative", zIndex: 1 }}>
              {t.atRisk && <span className="badge risk">due pressure</span>}
              {t.locked && <span className="badge warn">locked</span>}
            </div>
            {tab === "completed" && (
              <button
                className="btn secondary"
                onClick={() => void reopen(t.id)}
                title="Mark incomplete"
                style={{ position: "relative", zIndex: 1 }}
              >
                <RotateCcw size={14} /> Reopen
              </button>
            )}
          </div>
        ))}
        {visible.length === 0 && (
          <p style={{ color: "var(--ink-muted)" }}>
            {tab === "completed" ? "No completed tasks yet." : "No open tasks in this view."}
          </p>
        )}
      </div>

      <NewTaskModal
        open={createOpen}
        initialMode={createMode}
        onClose={() => {
          setCreateOpen(false);
          void load();
        }}
      />
    </div>
  );
}
