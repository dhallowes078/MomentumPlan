"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Lock,
  Paperclip,
  Send,
  Trash2,
  Unlock,
} from "lucide-react";
import { formatDay, formatMinutes, formatTime, priorityColor } from "@/lib/format";
import { describeEventPayload, eventLabel } from "@/lib/history";
import { describeRecurrence } from "@/lib/recurrence";
import { useThemePrefs } from "@/components/ThemeProvider";
import { PriorityButtons } from "@/components/PriorityButtons";
import { BucketSelect } from "@/components/BucketSelect";
import { DueDatePicker } from "@/components/DueDatePicker";
import { AssigneeSelect } from "@/components/AssigneeSelect";
import { FileButton } from "@/components/FileButton";
import { EmojiPicker } from "@/components/EmojiPicker";
import { RecurWeekdayPicker } from "@/components/RecurWeekdayPicker";
import { NotesEditor, isEmptyNotesHtml } from "@/components/NotesEditor";
import { cachedJson, invalidateClientCache } from "@/lib/client-fetch";
import * as localRepo from "@/lib/local/repo";
import { apiFetch, apiUpload, resolveMediaUrl } from "@/lib/sync-api";

type Member = {
  id: string;
  name: string | null;
  email: string;
  image?: string | null;
  color?: string | null;
};

type ChecklistItem = { id?: string; text: string; done: boolean; position?: number };

type ScheduleBlock = {
  id: string;
  start: string;
  end: string;
  completed: boolean;
};

type RecurFreq = "DAILY" | "WEEKLY" | "MONTHLY";

type TaskDetail = {
  id: string;
  workspaceId: string;
  title: string;
  notes: string | null;
  headerImageKey: string | null;
  headerImageUrl?: string | null;
  emoji?: string | null;
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
  bucket?: { id: string; name: string; color: string } | null;
  isRecurring?: boolean;
  recurFreq?: RecurFreq | null;
  recurInterval?: number;
  recurByWeekdays?: number[] | null;
  recurEndsAt?: string | null;
  recurCount?: number | null;
  links: { id: string; url: string; title: string | null }[];
  attachments: {
    id: string;
    fileName: string;
    sizeBytes: number;
    storageKey: string;
    url?: string;
  }[];
  checklistItems: ChecklistItem[];
  mentions: { userId: string; user: Member }[];
  scheduleBlocks: ScheduleBlock[];
  comments: {
    id: string;
    body: string;
    createdAt: string;
    author: {
      id: string;
      name: string | null;
      email: string;
      color?: string | null;
      image?: string | null;
    };
  }[];
  events: {
    id: string;
    type: string;
    createdAt: string;
    payload?: unknown;
    actor?: { name: string | null; email: string } | null;
  }[];
};

type TaskDraft = {
  title: string;
  notes: string;
  priority: number;
  estimateMinutes: number;
  dueAt: string | null;
  bucketId: string | null;
  bucket: { id: string; name: string; color: string } | null;
  assigneeId: string | null;
  locked: boolean;
  allowSplit: boolean;
  headerImageKey: string | null;
  headerImageUrl: string | null;
  emoji: string | null;
  isRecurring: boolean;
  recurFreq: RecurFreq;
  recurInterval: number;
  recurByWeekdays: number[];
  recurEndsAt: string;
  recurCount: string;
};

const SIZE_KEYS = ["tiny", "small", "medium", "big"] as const;

function toDraft(task: TaskDetail): TaskDraft {
  return {
    title: task.title,
    notes: task.notes ?? "",
    priority: task.priority,
    estimateMinutes: task.estimateMinutes,
    dueAt: task.dueAt,
    bucketId: task.bucketId,
    bucket: task.bucket ?? null,
    assigneeId: task.assigneeId,
    locked: task.locked,
    allowSplit: task.allowSplit,
    headerImageKey: task.headerImageKey,
    headerImageUrl: task.headerImageUrl ?? null,
    emoji: task.emoji ?? null,
    isRecurring: Boolean(task.isRecurring),
    recurFreq: task.recurFreq ?? "WEEKLY",
    recurInterval: task.recurInterval ?? 1,
    recurByWeekdays: Array.isArray(task.recurByWeekdays) ? task.recurByWeekdays : [],
    recurEndsAt: task.recurEndsAt ? task.recurEndsAt.slice(0, 10) : "",
    recurCount: task.recurCount != null ? String(task.recurCount) : "",
  };
}

function sameMentions(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const as = [...a].sort();
  const bs = [...b].sort();
  return as.every((id, i) => id === bs[i]);
}

function draftPatchBody(draft: TaskDraft, baseline: TaskDraft) {
  const body: Record<string, unknown> = {};
  if (draft.title !== baseline.title) body.title = draft.title.trim() || baseline.title;
  if (draft.notes !== baseline.notes) {
    body.notes = draft.notes.trim() && !isEmptyNotesHtml(draft.notes) ? draft.notes : null;
  }
  if (draft.priority !== baseline.priority) body.priority = draft.priority;
  if (draft.estimateMinutes !== baseline.estimateMinutes) {
    body.estimateMinutes = Math.max(5, Number(draft.estimateMinutes) || 5);
  }
  if (draft.dueAt !== baseline.dueAt) body.dueAt = draft.dueAt;
  if (draft.bucketId !== baseline.bucketId) body.bucketId = draft.bucketId;
  if (draft.assigneeId !== baseline.assigneeId) body.assigneeId = draft.assigneeId;
  if (draft.locked !== baseline.locked) body.locked = draft.locked;
  if (draft.allowSplit !== baseline.allowSplit) body.allowSplit = draft.allowSplit;
  if (draft.headerImageKey !== baseline.headerImageKey) {
    body.headerImageKey = draft.headerImageKey;
  }
  if (draft.emoji !== baseline.emoji) body.emoji = draft.emoji;
  if (draft.isRecurring !== baseline.isRecurring) body.isRecurring = draft.isRecurring;
  if (draft.isRecurring) {
    if (draft.recurFreq !== baseline.recurFreq || draft.isRecurring !== baseline.isRecurring) {
      body.recurFreq = draft.recurFreq;
    }
    if (
      draft.recurInterval !== baseline.recurInterval ||
      draft.isRecurring !== baseline.isRecurring
    ) {
      body.recurInterval = Math.max(1, Number(draft.recurInterval) || 1);
    }
    const endsIso = draft.recurEndsAt
      ? new Date(`${draft.recurEndsAt}T23:59:59`).toISOString()
      : null;
    const baseEnds = baseline.recurEndsAt
      ? new Date(`${baseline.recurEndsAt}T23:59:59`).toISOString()
      : null;
    if (endsIso !== baseEnds || draft.isRecurring !== baseline.isRecurring) {
      body.recurEndsAt = endsIso;
    }
    const count = draft.recurCount.trim() ? Math.max(1, Number(draft.recurCount) || 1) : null;
    const baseCount = baseline.recurCount.trim()
      ? Math.max(1, Number(baseline.recurCount) || 1)
      : null;
    if (count !== baseCount || draft.isRecurring !== baseline.isRecurring) {
      body.recurCount = count;
    }
    const daysChanged =
      draft.recurByWeekdays.length !== baseline.recurByWeekdays.length ||
      draft.recurByWeekdays.some((d, i) => d !== baseline.recurByWeekdays[i]);
    if (daysChanged || draft.isRecurring !== baseline.isRecurring || draft.recurFreq !== baseline.recurFreq) {
      body.recurByWeekdays =
        draft.recurFreq === "WEEKLY" && draft.recurByWeekdays.length
          ? draft.recurByWeekdays
          : null;
    }
  } else if (baseline.isRecurring) {
    body.recurFreq = null;
    body.recurEndsAt = null;
    body.recurCount = null;
    body.recurByWeekdays = null;
  }
  return body;
}

export default function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const theme = useThemePrefs();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const [baseline, setBaseline] = useState<TaskDraft | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [buckets, setBuckets] = useState<{ id: string; name: string; color: string }[]>([]);
  const [comment, setComment] = useState("");
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [baselineMentions, setBaselineMentions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);

  const [loadError, setLoadError] = useState<string | null>(null);

  const sizeMinutes = useMemo(
    () => ({
      tiny: theme.tinyMinutes,
      small: theme.smallMinutes,
      medium: theme.mediumMinutes,
      big: theme.bigMinutes,
    }),
    [theme]
  );

  const activeSize = useMemo(() => {
    if (!draft) return null;
    return SIZE_KEYS.find((key) => sizeMinutes[key] === draft.estimateMinutes) ?? null;
  }, [draft, sizeMinutes]);

  const applyLoaded = useCallback((loaded: TaskDetail) => {
    const nextDraft = toDraft(loaded);
    setTask(loaded);
    setDraft(nextDraft);
    setBaseline(nextDraft);
    const mentions = (loaded.mentions ?? []).map((m) => m.userId);
    setMentionIds(mentions);
    setBaselineMentions(mentions);
    setLoadError(null);
  }, []);

  const loadFromLocal = useCallback(async (id: string) => {
    const local = await localRepo.getTask(id);
    if (!local) return false;
    const ws = await localRepo.getWorkspace(local.workspaceId);
    const blocks = (await localRepo.listScheduleBlocks()).filter((b) => b.taskId === id);
    applyLoaded({
      id: local.id,
      workspaceId: local.workspaceId,
      title: local.title,
      notes: local.notes,
      headerImageKey: local.headerImageKey,
      headerImageUrl: local.headerImageUrl ?? null,
      emoji: local.emoji,
      priority: local.priority,
      estimateMinutes: local.estimateMinutes,
      status: local.status,
      dueAt: local.dueAt,
      scheduledStart: local.scheduledStart,
      scheduledEnd: local.scheduledEnd,
      atRisk: local.atRisk,
      locked: local.locked,
      allowSplit: local.allowSplit,
      assigneeId: local.assigneeId,
      bucketId: local.bucketId,
      bucket: local.bucket ?? null,
      isRecurring: local.isRecurring,
      recurFreq: (local.recurFreq as RecurFreq | null) ?? null,
      recurInterval: local.recurInterval,
      recurByWeekdays: local.recurByWeekdays ?? null,
      recurEndsAt: local.recurEndsAt ?? null,
      recurCount: local.recurCount ?? null,
      links: [],
      attachments: [],
      checklistItems: [],
      mentions: [],
      scheduleBlocks: blocks.map((b) => ({
        id: b.id,
        start: b.start,
        end: b.end,
        completed: b.completed,
      })),
      comments: [],
      events: [],
    });
    if (ws) {
      setMembers(ws.members);
      setBuckets(ws.buckets ?? []);
    }
    return true;
  }, [applyLoaded]);

  const load = useCallback(async (force = false) => {
    const id = String(params.id ?? "");
    if (!id) {
      setLoadError("Missing task id");
      return;
    }
    try {
      const data = await cachedJson<{
        task: TaskDetail;
        workspace?: {
          buckets: { id: string; name: string; color: string }[];
          members: Member[];
        };
      }>(`/api/tasks/${id}`, { softTtlMs: 8_000, force });
      applyLoaded(data.task);
      if (data.workspace) {
        setMembers(data.workspace.members);
        setBuckets(data.workspace.buckets ?? []);
      } else {
        const ws = await cachedJson<{
          workspace: {
            members: { user: Member }[];
            buckets: { id: string; name: string; color: string }[];
          };
        }>(`/api/workspaces/${data.task.workspaceId}`, { softTtlMs: 60_000, force });
        setMembers(ws.workspace.members.map((m) => m.user));
        setBuckets(ws.workspace.buckets ?? []);
      }
    } catch {
      const ok = await loadFromLocal(id);
      if (!ok) setLoadError("Couldn’t load this task");
    }
  }, [params.id, applyLoaded, loadFromLocal]);

  useEffect(() => {
    setTask(null);
    setDraft(null);
    setLoadError(null);
    void load();
  }, [load]);

  const mentionsDirty = !sameMentions(mentionIds, baselineMentions);
  const draftDirty =
    draft && baseline ? JSON.stringify(draft) !== JSON.stringify(baseline) : false;
  const dirty = Boolean(draftDirty || mentionsDirty);

  function updateDraft(patch: Partial<TaskDraft>) {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  async function saveChanges() {
    if (!draft || !baseline || !task) return;
    setSaving(true);
    try {
      const body = draftPatchBody(draft, baseline);
      if (mentionsDirty) body.mentionIds = mentionIds;

      if (Object.keys(body).length > 0) {
        await localRepo.patchLocalTask(String(params.id), {
          title: (body.title as string) ?? draft.title,
          notes: (body.notes as string | null) ?? draft.notes,
          priority: (body.priority as number) ?? draft.priority,
          estimateMinutes: (body.estimateMinutes as number) ?? draft.estimateMinutes,
          dueAt: (body.dueAt as string | null) ?? draft.dueAt,
          bucketId: (body.bucketId as string | null) ?? draft.bucketId,
          assigneeId: (body.assigneeId as string | null) ?? draft.assigneeId,
          locked: (body.locked as boolean) ?? draft.locked,
          allowSplit: (body.allowSplit as boolean) ?? draft.allowSplit,
          emoji: (body.emoji as string | null) ?? draft.emoji,
          headerImageKey: (body.headerImageKey as string | null) ?? draft.headerImageKey,
        }, body);
      }

      const { saveAndSync } = await import("@/lib/local/sync");
      await saveAndSync();
      await load(true);
    } finally {
      setSaving(false);
    }
  }

  async function completeTask() {
    setCompleting(true);
    await localRepo.patchLocalTask(
      String(params.id),
      { status: "DONE", completedAt: new Date().toISOString() },
      { status: "DONE" }
    );
    const { saveAndSync } = await import("@/lib/local/sync");
    await saveAndSync();
    void import("@/lib/local/widget-sync").then((m) => m.syncHomeWidget());
    window.setTimeout(() => {
      router.push("/tasks");
    }, 850);
  }

  async function reopenTask() {
    await localRepo.patchLocalTask(
      String(params.id),
      { status: "TODO", completedAt: null },
      { status: "TODO" }
    );
    const { saveAndSync } = await import("@/lib/local/sync");
    await saveAndSync();
    await load(true);
  }

  async function remove() {
    if (!confirm("Delete this task?")) return;
    await localRepo.deleteLocalTask(String(params.id));
    const { saveAndSync } = await import("@/lib/local/sync");
    await saveAndSync();
    router.push("/tasks");
  }

  async function toggleChunk(blockId: string, completed: boolean) {
    await fetch(`/api/schedule-blocks/${blockId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed }),
    });
    invalidateClientCache(`/api/tasks/${params.id}`);
    invalidateClientCache("/api/today");
    await load(true);
  }

  async function addComment(e: React.FormEvent) {
    e.preventDefault();
    if (!comment.trim()) return;
    await apiFetch(`/api/tasks/${params.id}/comments`, {
      method: "POST",
      body: JSON.stringify({ body: comment }),
    });
    setComment("");
    await load();
  }

  async function upload(file: File) {
    const fd = new FormData();
    fd.set("file", file);
    const res = await apiUpload(`/api/tasks/${params.id}/attachments`, fd);
    if (!res.ok) return;
    await load();
  }

  async function uploadHeader(file: File) {
    const fd = new FormData();
    fd.set("file", file);
    const res = await apiUpload(`/api/tasks/${params.id}/header`, fd);
    if (!res.ok) return;
    const data = await res.json();
    updateDraft({
      headerImageKey: data.headerImageKey ?? null,
      headerImageUrl: data.headerImageUrl ?? null,
    });
    await localRepo.patchLocalTask(String(params.id), {
      headerImageKey: data.headerImageKey ?? null,
      headerImageUrl: data.headerImageUrl ?? null,
    });
    await load();
  }

  async function saveAsTemplate() {
    if (!task || !draft) return;
    const name = window.prompt("Template name?");
    if (!name?.trim()) return;
    await apiFetch("/api/templates", {
      method: "POST",
      body: JSON.stringify({
        workspaceId: task.workspaceId,
        name: name.trim(),
        title: draft.title.trim() || task.title,
        notes: draft.notes || null,
        priority: draft.priority,
        estimateMinutes: Math.max(5, Number(draft.estimateMinutes) || 5),
        bucketId: draft.bucketId,
        headerImageKey: draft.headerImageKey,
      }),
    });
  }

  if (!task || !draft) {
    return (
      <p style={{ color: "var(--ink-muted)" }}>
        {loadError ?? "Loading task…"}
      </p>
    );
  }

  const headerMedia = resolveMediaUrl(draft.headerImageUrl);
  const headerFallback = draft.bucket
    ? `linear-gradient(135deg, ${draft.bucket.color}, color-mix(in srgb, ${draft.bucket.color} 55%, var(--accent)))`
    : "linear-gradient(135deg, color-mix(in srgb, var(--brand) 35%, transparent), color-mix(in srgb, var(--accent) 22%, transparent))";

  const chunks = task.scheduleBlocks ?? [];
  const recurLabel = describeRecurrence({
    isRecurring: Boolean(draft.isRecurring),
    recurFreq: draft.recurFreq,
    recurInterval: draft.recurInterval,
  });

  return (
    <div className={`page-wrap rise ${completing ? "completing" : ""}`}>
      {dirty && (
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 30,
            display: "flex",
            justifyContent: "flex-end",
            gap: "0.5rem",
            padding: "0.55rem 10px",
            marginBottom: "0.35rem",
            borderRadius: 12,
            background: "color-mix(in srgb, var(--bg) 92%, transparent)",
            backdropFilter: "blur(8px)",
          }}
        >
          <button className="btn" type="button" disabled={saving} onClick={() => void saveChanges()}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem" }}>
        <Link href="/tasks" className="btn ghost">
          <ArrowLeft size={16} /> Back
        </Link>
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          <button className="btn secondary" type="button" onClick={() => void saveAsTemplate()}>
            Save as template
          </button>
          {task.status !== "DONE" ? (
            <button className="btn" type="button" onClick={() => void completeTask()}>
              <Check size={16} /> Mark as Complete
            </button>
          ) : (
            <button className="btn secondary" type="button" onClick={() => void reopenTask()}>
              Reopen
            </button>
          )}
          <button className="btn secondary" type="button" onClick={() => void remove()}>
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <section className="card" style={{ padding: 0, overflow: "hidden", display: "grid", gap: 0 }}>
        <div
          style={{
            minHeight: headerMedia ? 120 : 72,
            background: headerFallback,
            position: "relative",
            overflow: "hidden",
          }}
        >
          {headerMedia ? (
            <img
              src={headerMedia}
              alt=""
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: "center",
              }}
            />
          ) : null}
          <div
            style={{
              position: "absolute",
              left: "50%",
              bottom: "0.75rem",
              transform: "translateX(-50%)",
              zIndex: 1,
            }}
          >
            <FileButton
              label="Header image"
              icon="image"
              accept="image/*"
              onChange={(files) => {
                const f = files?.[0];
                if (f) void uploadHeader(f);
              }}
            />
          </div>
        </div>

        <div style={{ padding: "1.1rem", display: "grid", gap: "0.85rem" }}>
          <input
            className="field"
            style={{ fontSize: "1.25rem", fontWeight: 650 }}
            value={draft.title}
            onChange={(e) => updateDraft({ title: e.target.value })}
          />

          <EmojiPicker
            value={draft.emoji}
            onChange={(emoji) => updateDraft({ emoji })}
          />

          <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem" }}>
            Bucket
            <BucketSelect
              buckets={buckets}
              value={draft.bucketId ?? ""}
              onChange={(id) => {
                updateDraft({
                  bucketId: id || null,
                  bucket: buckets.find((b) => b.id === id) ?? null,
                });
              }}
            />
          </label>

          <div>
            <div style={{ fontSize: "0.85rem", marginBottom: "0.35rem" }}>Priority</div>
            <PriorityButtons
              value={draft.priority}
              onChange={(priority) => updateDraft({ priority })}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: draft.locked ? "1fr" : "1fr 1fr", gap: "0.55rem" }}>
            {!draft.locked && (
              <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem" }}>
                Due date
                <DueDatePicker
                  value={draft.dueAt ? draft.dueAt.slice(0, 10) : ""}
                  onChange={(due) => {
                    const dueAt = due ? new Date(`${due}T17:00:00`).toISOString() : null;
                    updateDraft({ dueAt });
                  }}
                />
              </label>
            )}
            <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem" }}>
              Assignee
              <AssigneeSelect
                members={members}
                value={draft.assigneeId ?? ""}
                onChange={(id) => updateDraft({ assigneeId: id || null })}
              />
            </label>
          </div>

          <NotesEditor
            value={draft.notes}
            onChange={(notes) => updateDraft({ notes })}
          />

          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem" }}>
            {task.atRisk && <span className="badge risk">due pressure</span>}
            {draft.locked && <span className="badge warn">{draft.dueAt ? "locked schedule" : "event"}</span>}
            {task.scheduledStart && task.scheduledEnd && (
              <span className="badge">
                {draft.locked ? "Event · " : ""}
                {formatDay(task.scheduledStart)} {formatTime(task.scheduledStart)}–
                {formatTime(task.scheduledEnd)}
              </span>
            )}
            {recurLabel && <span className="badge">{recurLabel}</span>}
            <span className="badge" style={{ color: priorityColor(draft.priority) }}>
              {draft.priority} · {formatMinutes(draft.estimateMinutes)}
            </span>
          </div>

          <div>
            <div style={{ fontSize: "0.85rem", marginBottom: "0.35rem" }}>Task length</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.5rem" }}>
              {SIZE_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  className="btn secondary"
                  style={
                    activeSize === key
                      ? { background: "color-mix(in srgb, var(--brand) 16%, transparent)" }
                      : undefined
                  }
                  onClick={() => updateDraft({ estimateMinutes: sizeMinutes[key] })}
                >
                  {key[0].toUpperCase() + key.slice(1)} ({sizeMinutes[key]}m)
                </button>
              ))}
            </div>
            <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem", maxWidth: 180 }}>
              Custom (min)
              <input
                className="field"
                type="number"
                min={5}
                step={5}
                value={draft.estimateMinutes}
                onChange={(e) =>
                  updateDraft({ estimateMinutes: Number(e.target.value) || 5 })
                }
              />
            </label>
          </div>

          <div style={{ display: "grid", gap: "0.5rem" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <input
                type="checkbox"
                checked={draft.isRecurring}
                onChange={(e) => updateDraft({ isRecurring: e.target.checked })}
              />
              <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                {draft.locked ? "Recurring event" : "Recurring task"}
              </span>
            </label>
            {draft.isRecurring && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem" }}>
                  Repeats
                  <select
                    className="field"
                    value={draft.recurFreq}
                    onChange={(e) =>
                      updateDraft({ recurFreq: e.target.value as RecurFreq })
                    }
                  >
                    <option value="DAILY">Daily</option>
                    <option value="WEEKLY">Weekly</option>
                    <option value="MONTHLY">Monthly</option>
                  </select>
                </label>
                <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem" }}>
                  Every
                  <input
                    className="field"
                    type="number"
                    min={1}
                    value={draft.recurInterval}
                    onChange={(e) =>
                      updateDraft({ recurInterval: Number(e.target.value) || 1 })
                    }
                  />
                </label>
                {draft.recurFreq === "WEEKLY" && (
                  <RecurWeekdayPicker
                    value={draft.recurByWeekdays}
                    onChange={(days) => updateDraft({ recurByWeekdays: days })}
                  />
                )}
                <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem" }}>
                  Ends on
                  <input
                    className="field"
                    type="date"
                    value={draft.recurEndsAt}
                    onChange={(e) => updateDraft({ recurEndsAt: e.target.value })}
                  />
                </label>
                <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem" }}>
                  Or after (count)
                  <input
                    className="field"
                    type="number"
                    min={1}
                    value={draft.recurCount}
                    onChange={(e) => updateDraft({ recurCount: e.target.value })}
                    placeholder="Unlimited"
                  />
                </label>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              className="btn secondary"
              type="button"
              onClick={() => updateDraft({ locked: !draft.locked })}
            >
              {draft.locked ? <Unlock size={16} /> : <Lock size={16} />}
              {draft.locked ? "Unlock schedule" : "Lock schedule"}
            </button>
            <button
              className="btn secondary"
              type="button"
              onClick={() => updateDraft({ allowSplit: !draft.allowSplit })}
            >
              Split: {draft.allowSplit ? "on" : "off"}
            </button>
          </div>
        </div>
      </section>

      {chunks.length > 1 && (
        <section className="card" style={{ padding: "1rem", display: "grid", gap: "0.65rem" }}>
          <h2 style={{ margin: 0, fontSize: "1rem" }}>Chunks</h2>
          <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.85rem" }}>
            Complete individual schedule chunks for larger split tasks.
          </p>
          {chunks.map((block) => (
            <div
              key={block.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.65rem",
                padding: "0.55rem 0.65rem",
                borderRadius: 10,
                border: "1px solid var(--line)",
                opacity: block.completed ? 0.7 : 1,
                textDecoration: block.completed ? "line-through" : undefined,
              }}
            >
              <input
                type="checkbox"
                checked={block.completed}
                onChange={(e) => void toggleChunk(block.id, e.target.checked)}
              />
              <div style={{ flex: 1 }}>
                {formatDay(block.start)} · {formatTime(block.start)}–{formatTime(block.end)}
              </div>
              {block.completed && <span className="badge">done</span>}
            </div>
          ))}
        </section>
      )}

      <section className="card" style={{ padding: "1rem", display: "grid", gap: "0.75rem" }}>
        <h2 style={{ margin: 0, fontSize: "1rem" }}>Tag members</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
          {members.map((m) => {
            const on = mentionIds.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                className="btn secondary"
                style={
                  on
                    ? {
                        background: `color-mix(in srgb, ${m.color ?? "var(--brand)"} 18%, transparent)`,
                        borderColor: m.color ?? undefined,
                      }
                    : undefined
                }
                onClick={() => {
                  setMentionIds(
                    on ? mentionIds.filter((id) => id !== m.id) : [...mentionIds, m.id]
                  );
                }}
              >
                @{m.name ?? m.email}
              </button>
            );
          })}
          {members.length === 0 && (
            <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.9rem" }}>
              Invite workspace members in Settings to tag them here.
            </p>
          )}
        </div>
      </section>

      <section className="card" style={{ padding: "1rem", display: "grid", gap: "0.75rem" }}>
        <h2 style={{ margin: 0, fontSize: "1rem", display: "flex", gap: "0.4rem", alignItems: "center" }}>
          <Paperclip size={16} /> Documents
        </h2>
        {task.attachments.map((a) => (
          <a
            key={a.id}
            href={resolveMediaUrl(a.url) ?? `/api/attachments/file?key=${encodeURIComponent(a.storageKey.replace(/^local:/, ""))}`}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: "0.9rem", color: "var(--brand)" }}
          >
            {a.fileName}{" "}
            <span style={{ color: "var(--ink-muted)" }}>({Math.round(a.sizeBytes / 1024)} KB)</span>
          </a>
        ))}
        <FileButton
          label="Upload document"
          icon="file"
          onChange={(files) => {
            const f = files?.[0];
            if (f) void upload(f);
          }}
        />
      </section>

      <section className="card" style={{ padding: "1rem", display: "grid", gap: "0.75rem" }}>
        <h2 style={{ margin: 0, fontSize: "1rem" }}>Comments</h2>
        {task.comments.map((c) => {
          const color = c.author.color || "var(--brand)";
          return (
            <div
              key={c.id}
              style={{
                padding: "0.65rem 0.75rem",
                borderRadius: 10,
                borderLeft: `4px solid ${color}`,
                background: `color-mix(in srgb, ${color} 10%, transparent)`,
              }}
            >
              <div style={{ fontSize: "0.8rem", color: "var(--ink-muted)", marginBottom: "0.25rem" }}>
                <span style={{ color, fontWeight: 650 }}>{c.author.name ?? c.author.email}</span> ·{" "}
                {formatDay(c.createdAt)}
              </div>
              <div>{c.body}</div>
            </div>
          );
        })}
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
        <div style={{ display: "grid", gap: "0.65rem" }}>
          {task.events.map((ev) => {
            const detail = describeEventPayload(ev.type, ev.payload);
            return (
              <div key={ev.id} style={{ fontSize: "0.85rem" }}>
                <div>
                  <strong>{eventLabel(ev.type)}</strong>
                  {ev.actor ? ` · ${ev.actor.name ?? ev.actor.email}` : ""} · {formatDay(ev.createdAt)}{" "}
                  {formatTime(ev.createdAt)}
                </div>
                {detail && (
                  <div style={{ color: "var(--ink-muted)", marginTop: "0.15rem" }}>{detail}</div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
