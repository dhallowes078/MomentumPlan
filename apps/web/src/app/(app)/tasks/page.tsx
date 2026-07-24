"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { formatMinutes, priorityColor } from "@/lib/format";

type Workspace = {
  id: string;
  name: string;
  buckets: { id: string; name: string; color: string }[];
};

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
  bucket?: { id: string; name: string; color: string } | null;
  _count?: { comments: number; attachments: number };
};

export default function TasksPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string>("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [bucketFilter, setBucketFilter] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState(3);
  const [estimate, setEstimate] = useState(30);
  const [bucketId, setBucketId] = useState<string>("");
  const [dueAt, setDueAt] = useState("");

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
    const q = new URLSearchParams({ workspaceId: wid });
    const data = await fetch(`/api/tasks?${q}`).then((r) => r.json());
    setTasks(data.tasks.filter((t: Task) => t.status !== "DONE" && t.status !== "CANCELLED"));
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !workspaceId) return;
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId,
        title,
        priority,
        estimateMinutes: estimate,
        bucketId: bucketId || null,
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
      }),
    });
    setTitle("");
    setShowCreate(false);
    await load();
  }

  const filtered =
    bucketFilter === "all" ? tasks : tasks.filter((t) => t.bucketId === bucketFilter);

  return (
    <div className="rise" style={{ display: "grid", gap: "1rem" }}>
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
            Buckets, priorities, and estimates that feed the auto-scheduler.
          </p>
        </div>
        <button className="btn" onClick={() => setShowCreate((v) => !v)}>
          <Plus size={16} /> New
        </button>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
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
        <button
          className={`btn secondary`}
          style={bucketFilter === "all" ? { background: "rgba(31,77,58,0.12)" } : undefined}
          onClick={() => setBucketFilter("all")}
        >
          All
        </button>
        {current?.buckets.map((b) => (
          <button
            key={b.id}
            className="btn secondary"
            style={
              bucketFilter === b.id
                ? { background: "rgba(31,77,58,0.12)", borderColor: b.color }
                : undefined
            }
            onClick={() => setBucketFilter(b.id)}
          >
            {b.name}
          </button>
        ))}
      </div>

      {showCreate && (
        <form className="card" style={{ padding: "1rem", display: "grid", gap: "0.65rem" }} onSubmit={createTask}>
          <input
            className="field"
            placeholder="What needs doing?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
            <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem" }}>
              Priority (1–5)
              <input
                className="field"
                type="number"
                min={1}
                max={5}
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
              />
            </label>
            <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem" }}>
              Estimate (min)
              <input
                className="field"
                type="number"
                min={5}
                step={5}
                value={estimate}
                onChange={(e) => setEstimate(Number(e.target.value))}
              />
            </label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
            <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem" }}>
              Bucket
              <select className="field" value={bucketId} onChange={(e) => setBucketId(e.target.value)}>
                <option value="">None</option>
                {current?.buckets.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem" }}>
              Due
              <input
                className="field"
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
              />
            </label>
          </div>
          <button className="btn" type="submit">
            Create & schedule
          </button>
        </form>
      )}

      <div style={{ display: "grid", gap: "0.55rem" }}>
        {filtered.map((t) => (
          <Link
            key={t.id}
            href={`/tasks/${t.id}`}
            className="card"
            style={{
              padding: "0.9rem 1rem",
              display: "grid",
              gridTemplateColumns: "auto 1fr auto",
              gap: "0.75rem",
              alignItems: "center",
            }}
          >
            <span className="priority-dot" style={{ background: priorityColor(t.priority) }} />
            <div>
              <div style={{ fontWeight: 600 }}>{t.title}</div>
              <div style={{ fontSize: "0.8rem", color: "var(--ink-muted)", marginTop: "0.2rem" }}>
                P{t.priority} · {formatMinutes(t.estimateMinutes)}
                {t.bucket ? ` · ${t.bucket.name}` : ""}
                {t._count?.comments ? ` · ${t._count.comments} comments` : ""}
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.35rem" }}>
              {t.atRisk && <span className="badge risk">at risk</span>}
              {t.locked && <span className="badge warn">locked</span>}
            </div>
          </Link>
        ))}
        {filtered.length === 0 && (
          <p style={{ color: "var(--ink-muted)" }}>No open tasks in this view.</p>
        )}
      </div>
    </div>
  );
}
