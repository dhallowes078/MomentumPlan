"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Link2,
  Lock,
  Paperclip,
  Send,
  Trash2,
  Unlock,
} from "lucide-react";
import { formatDay, formatMinutes, formatTime, priorityColor } from "@/lib/format";

type Member = { id: string; name: string | null; email: string };

type TaskDetail = {
  id: string;
  workspaceId: string;
  title: string;
  notes: string | null;
  priority: number;
  estimateMinutes: number;
  status: string;
  dueAt: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  atRisk: boolean;
  locked: boolean;
  allowSplit: boolean;
  assigneeId: string | null;
  bucketId: string | null;
  bucket?: { id: string; name: string } | null;
  links: { id: string; url: string; title: string | null }[];
  attachments: { id: string; fileName: string; sizeBytes: number; storageKey: string }[];
  comments: {
    id: string;
    body: string;
    createdAt: string;
    author: { id: string; name: string | null; email: string };
  }[];
  events: {
    id: string;
    type: string;
    createdAt: string;
    actor?: { name: string | null; email: string } | null;
  }[];
};

export default function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [comment, setComment] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/tasks/${params.id}`);
    if (!res.ok) return;
    const data = await res.json();
    setTask(data.task);
    const ws = await fetch(`/api/workspaces/${data.task.workspaceId}`).then((r) => r.json());
    setMembers(ws.workspace.members.map((m: { user: Member }) => m.user));
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(body: Record<string, unknown>) {
    setSaving(true);
    await fetch(`/api/tasks/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await load();
    setSaving(false);
  }

  async function addComment(e: React.FormEvent) {
    e.preventDefault();
    if (!comment.trim()) return;
    await fetch(`/api/tasks/${params.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: comment }),
    });
    setComment("");
    await load();
  }

  async function addLink(e: React.FormEvent) {
    e.preventDefault();
    if (!linkUrl.trim()) return;
    await fetch(`/api/tasks/${params.id}/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: linkUrl }),
    });
    setLinkUrl("");
    await load();
  }

  async function upload(file: File) {
    const fd = new FormData();
    fd.set("file", file);
    await fetch(`/api/tasks/${params.id}/attachments`, { method: "POST", body: fd });
    await load();
  }

  async function remove() {
    if (!confirm("Delete this task?")) return;
    await fetch(`/api/tasks/${params.id}`, { method: "DELETE" });
    router.push("/tasks");
  }

  if (!task) {
    return <p style={{ color: "var(--ink-muted)" }}>Loading task…</p>;
  }

  return (
    <div className="rise" style={{ display: "grid", gap: "1rem", maxWidth: 820 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem" }}>
        <Link href="/tasks" className="btn ghost">
          <ArrowLeft size={16} /> Back
        </Link>
        <div style={{ display: "flex", gap: "0.4rem" }}>
          {task.status !== "DONE" ? (
            <button className="btn" onClick={() => patch({ status: "DONE" })}>
              <Check size={16} /> Complete
            </button>
          ) : (
            <button className="btn secondary" onClick={() => patch({ status: "TODO" })}>
              Reopen
            </button>
          )}
          <button className="btn secondary" onClick={remove}>
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <section className="card" style={{ padding: "1.1rem", display: "grid", gap: "0.85rem" }}>
        <input
          className="field"
          style={{ fontSize: "1.25rem", fontWeight: 650 }}
          value={task.title}
          onChange={(e) => setTask({ ...task, title: e.target.value })}
          onBlur={() => patch({ title: task.title })}
        />
        <textarea
          className="field"
          rows={3}
          placeholder="Notes"
          value={task.notes ?? ""}
          onChange={(e) => setTask({ ...task, notes: e.target.value })}
          onBlur={() => patch({ notes: task.notes })}
        />

        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem" }}>
          {task.atRisk && <span className="badge risk">at risk</span>}
          {task.locked && <span className="badge warn">locked schedule</span>}
          {task.scheduledStart && task.scheduledEnd && (
            <span className="badge">
              {formatDay(task.scheduledStart)} {formatTime(task.scheduledStart)}–
              {formatTime(task.scheduledEnd)}
            </span>
          )}
          <span className="badge" style={{ color: priorityColor(task.priority) }}>
            P{task.priority} · {formatMinutes(task.estimateMinutes)}
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: "0.55rem" }}>
          <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem" }}>
            Priority
            <input
              className="field"
              type="number"
              min={1}
              max={5}
              value={task.priority}
              onChange={(e) => setTask({ ...task, priority: Number(e.target.value) })}
              onBlur={() => patch({ priority: task.priority })}
            />
          </label>
          <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem" }}>
            Estimate (min)
            <input
              className="field"
              type="number"
              min={5}
              step={5}
              value={task.estimateMinutes}
              onChange={(e) => setTask({ ...task, estimateMinutes: Number(e.target.value) })}
              onBlur={() => patch({ estimateMinutes: task.estimateMinutes })}
            />
          </label>
          <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem" }}>
            Due
            <input
              className="field"
              type="datetime-local"
              value={task.dueAt ? task.dueAt.slice(0, 16) : ""}
              onChange={(e) =>
                setTask({
                  ...task,
                  dueAt: e.target.value ? new Date(e.target.value).toISOString() : null,
                })
              }
              onBlur={() => patch({ dueAt: task.dueAt })}
            />
          </label>
          <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem" }}>
            Assignee
            <select
              className="field"
              value={task.assigneeId ?? ""}
              onChange={(e) => patch({ assigneeId: e.target.value || null })}
            >
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name ?? m.email}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            className="btn secondary"
            disabled={saving}
            onClick={() => patch({ locked: !task.locked })}
          >
            {task.locked ? <Unlock size={16} /> : <Lock size={16} />}
            {task.locked ? "Unlock schedule" : "Lock schedule"}
          </button>
          <button
            className="btn secondary"
            onClick={() => patch({ allowSplit: !task.allowSplit })}
          >
            Split: {task.allowSplit ? "on" : "off"}
          </button>
        </div>
      </section>

      <section className="card" style={{ padding: "1rem", display: "grid", gap: "0.75rem" }}>
        <h2 style={{ margin: 0, fontSize: "1rem", display: "flex", gap: "0.4rem", alignItems: "center" }}>
          <Link2 size={16} /> Links
        </h2>
        {task.links.map((l) => (
          <a key={l.id} href={l.url} target="_blank" rel="noreferrer" style={{ color: "var(--brand)" }}>
            {l.title || l.url}
          </a>
        ))}
        <form onSubmit={addLink} style={{ display: "flex", gap: "0.4rem" }}>
          <input
            className="field"
            placeholder="https://"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
          />
          <button className="btn secondary" type="submit">
            Add
          </button>
        </form>
      </section>

      <section className="card" style={{ padding: "1rem", display: "grid", gap: "0.75rem" }}>
        <h2 style={{ margin: 0, fontSize: "1rem", display: "flex", gap: "0.4rem", alignItems: "center" }}>
          <Paperclip size={16} /> Attachments
        </h2>
        {task.attachments.map((a) => (
          <div key={a.id} style={{ fontSize: "0.9rem" }}>
            {a.fileName}{" "}
            <span style={{ color: "var(--ink-muted)" }}>
              ({Math.round(a.sizeBytes / 1024)} KB)
            </span>
          </div>
        ))}
        <input
          type="file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
        />
      </section>

      <section className="card" style={{ padding: "1rem", display: "grid", gap: "0.75rem" }}>
        <h2 style={{ margin: 0, fontSize: "1rem" }}>Comments</h2>
        {task.comments.map((c) => (
          <div key={c.id} style={{ padding: "0.55rem 0", borderBottom: "1px solid var(--line)" }}>
            <div style={{ fontSize: "0.8rem", color: "var(--ink-muted)" }}>
              {c.author.name ?? c.author.email} · {formatDay(c.createdAt)}
            </div>
            <div>{c.body}</div>
          </div>
        ))}
        <form onSubmit={addComment} style={{ display: "flex", gap: "0.4rem" }}>
          <input
            className="field"
            placeholder="Write a comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <button className="btn" type="submit">
            <Send size={16} />
          </button>
        </form>
      </section>

      <section className="card" style={{ padding: "1rem" }}>
        <h2 style={{ margin: "0 0 0.75rem", fontSize: "1rem" }}>History</h2>
        <div style={{ display: "grid", gap: "0.45rem" }}>
          {task.events.map((ev) => (
            <div key={ev.id} style={{ fontSize: "0.85rem", color: "var(--ink-muted)" }}>
              <strong style={{ color: "var(--ink)" }}>{ev.type}</strong>
              {ev.actor ? ` · ${ev.actor.name ?? ev.actor.email}` : ""} · {formatDay(ev.createdAt)}{" "}
              {formatTime(ev.createdAt)}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
