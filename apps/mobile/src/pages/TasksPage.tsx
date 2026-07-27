import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { formatMinutes, priorityColor } from "@/lib/format";
import { useLocalTasks, useLocalWorkspaces } from "@/lib/local/hooks";
import * as repo from "@/lib/local/repo";
import { flushOutbox, pullFromServer } from "@/lib/local/sync";

export function TasksPage() {
  const workspaces = useLocalWorkspaces();
  const [workspaceId, setWorkspaceId] = useState("");
  const tasks = useLocalTasks(workspaceId);
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!workspaceId && workspaces[0]?.id) setWorkspaceId(workspaces[0].id);
  }, [workspaces, workspaceId]);

  const open = tasks.filter((t) => t.status !== "DONE" && t.status !== "CANCELLED");

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !workspaceId) return;
    setCreating(true);
    await repo.createLocalTask({
      workspaceId,
      title: title.trim(),
      estimateMinutes: 30,
      priority: 3,
    });
    setTitle("");
    await flushOutbox();
    await pullFromServer();
    setCreating(false);
  }

  async function complete(id: string) {
    await repo.patchLocalTask(id, { status: "DONE", completedAt: new Date().toISOString() }, { status: "DONE" });
    await flushOutbox();
  }

  return (
    <div className="page">
      <div>
        <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "1.75rem" }}>Tasks</h1>
        <p style={{ margin: "0.3rem 0 0", color: "var(--ink-muted)" }}>Saved on-device, synced when linked</p>
      </div>

      <form className="card" style={{ padding: "0.85rem", display: "flex", gap: "0.5rem" }} onSubmit={(e) => void createTask(e)}>
        <input
          className="field"
          placeholder="New task…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button className="btn" type="submit" disabled={creating || !title.trim()}>
          <Plus size={16} /> Add
        </button>
      </form>

      <div style={{ display: "grid", gap: "0.5rem" }}>
        {open.length === 0 ? (
          <p style={{ color: "var(--ink-muted)" }}>No open tasks.</p>
        ) : (
          open.map((t) => (
            <div
              key={t.id}
              className="card"
              style={{
                padding: "0.85rem 1rem",
                display: "flex",
                gap: "0.65rem",
                alignItems: "center",
              }}
            >
              <span className="priority-dot" style={{ background: priorityColor(t.priority) }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong>
                  {t.emoji ? `${t.emoji} ` : ""}
                  {t.title}
                </strong>
                <div style={{ fontSize: "0.8rem", color: "var(--ink-muted)" }}>
                  P{t.priority} · {formatMinutes(t.estimateMinutes)}
                  {t._localOnly ? " · pending sync" : ""}
                </div>
              </div>
              <button className="btn secondary compact" type="button" onClick={() => void complete(t.id)}>
                Done
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
