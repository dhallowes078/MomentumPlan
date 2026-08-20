"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ImagePlus, Paperclip, Trash2, X } from "lucide-react";
import { useThemePrefs } from "@/components/ThemeProvider";
import { PriorityButtons } from "@/components/PriorityButtons";
import { BucketSelect } from "@/components/BucketSelect";
import { DueDatePicker } from "@/components/DueDatePicker";
import { AssigneeSelect } from "@/components/AssigneeSelect";
import { FileButton } from "@/components/FileButton";
import { EmojiPicker } from "@/components/EmojiPicker";
import { createLocalTask, listWorkspaces, patchLocalTask } from "@/lib/local/repo";
import { saveAndSync } from "@/lib/local/sync";
import { apiFetch, apiUpload } from "@/lib/sync-api";
import { RecurWeekdayPicker } from "@/components/RecurWeekdayPicker";
import { NotesEditor, isEmptyNotesHtml } from "@/components/NotesEditor";

type Member = {
  id: string;
  name: string | null;
  email: string;
  image?: string | null;
  color?: string | null;
};

type Workspace = {
  id: string;
  name: string;
  buckets: { id: string; name: string; color: string }[];
};

type Mode = "simple" | "full";
type Variant = "task" | "event";

const SIZE_KEYS = ["tiny", "small", "medium", "big"] as const;

function todayInputValue() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function atLocal(dateStr: string, timeStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = (timeStr || "00:00").split(":").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0);
}

export function NewTaskModal({
  open,
  onClose,
  initialMode = "full",
  variant = "task",
  initialTitle = "",
}: {
  open: boolean;
  onClose: () => void;
  initialMode?: Mode;
  variant?: Variant;
  initialTitle?: string;
}) {
  const router = useRouter();
  const theme = useThemePrefs();
  const isEvent = variant === "event";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [priority, setPriority] = useState(3);
  const [estimate, setEstimate] = useState(30);
  const [bucketId, setBucketId] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [eventDate, setEventDate] = useState(todayInputValue);
  const [eventStart, setEventStart] = useState("09:00");
  const [eventEnd, setEventEnd] = useState("10:00");
  const [assigneeId, setAssigneeId] = useState("");
  const [meId, setMeId] = useState("");
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [headerFile, setHeaderFile] = useState<File | null>(null);
  const [headerPreview, setHeaderPreview] = useState<string | null>(null);
  const [emoji, setEmoji] = useState<string | null>(null);
  const [docs, setDocs] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurFreq, setRecurFreq] = useState<"DAILY" | "WEEKLY" | "MONTHLY">("WEEKLY");
  const [recurInterval, setRecurInterval] = useState(1);
  const [recurEndsAt, setRecurEndsAt] = useState("");
  const [recurCount, setRecurCount] = useState("");
  const [recurByWeekdays, setRecurByWeekdays] = useState<number[]>([]);
  const [templates, setTemplates] = useState<
    Array<{ id: string; name: string; title: string; priority: number; estimateMinutes: number }>
  >([]);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      setMode(isEvent ? "full" : initialMode);
      if (initialTitle) setTitle(initialTitle);
    }
  }, [open, initialMode, isEvent, initialTitle]);

  useEffect(() => {
    setPortalContainer(document.body);
  }, []);

  useEffect(() => {
    if (!open) return;
    void apiFetch("/api/workspaces")
      .then(async (r) => {
        if (r.ok) return r.json();
        const local = await listWorkspaces();
        return {
          workspaces: local.map((w) => ({
            id: w.id,
            name: w.name,
            buckets: w.buckets,
          })),
        };
      })
      .then((data) => {
        setWorkspaces(data.workspaces ?? []);
        setWorkspaceId((prev) => prev || data.workspaces?.[0]?.id || "");
      })
      .catch(async () => {
        const local = await listWorkspaces();
        setWorkspaces(
          local.map((w) => ({
            id: w.id,
            name: w.name,
            buckets: w.buckets,
          }))
        );
        setWorkspaceId((prev) => prev || local[0]?.id || "");
      });
    void apiFetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.user?.id) setMeId(data.user.id);
      })
      .catch(() => undefined);
  }, [open]);

  useEffect(() => {
    setEstimate(theme.smallMinutes);
  }, [theme.smallMinutes]);

  useEffect(() => {
    if (!workspaceId) {
      setMembers([]);
      setTemplates([]);
      return;
    }
    void apiFetch(`/api/workspaces/${workspaceId}`)
      .then(async (r) => {
        if (r.ok) return r.json();
        const local = await listWorkspaces();
        const ws = local.find((w) => w.id === workspaceId);
        return {
          workspace: ws
            ? {
                members: (ws.members ?? []).map((user) => ({ user })),
                buckets: ws.buckets,
              }
            : null,
        };
      })
      .then((data) => {
        const nextMembers: Member[] = (data.workspace?.members ?? []).map(
          (m: { user: Member }) => m.user
        );
        if (nextMembers.length === 0 && meId) {
          nextMembers.push({ id: meId, name: "Me", email: "me@local" });
        }
        if (nextMembers.length === 0) {
          nextMembers.push({ id: "local-me", name: "Me", email: "me@local", color: "#3D6B4F" });
        }
        setMembers(nextMembers);
        const preferred = meId && nextMembers.some((m) => m.id === meId) ? meId : nextMembers[0]?.id;
        setAssigneeId((prev) => (prev && nextMembers.some((m) => m.id === prev) ? prev : preferred || ""));
      })
      .catch(async () => {
        const local = await listWorkspaces();
        const ws = local.find((w) => w.id === workspaceId);
        const nextMembers: Member[] =
          ws?.members?.length
            ? ws.members
            : [{ id: meId || "local-me", name: "Me", email: "me@local", color: "#3D6B4F" }];
        setMembers(nextMembers);
        setAssigneeId((prev) => prev || nextMembers[0]?.id || "");
      });
    void apiFetch(`/api/templates?workspaceId=${workspaceId}`)
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((data) => setTemplates(data.templates ?? []))
      .catch(() => setTemplates([]));
  }, [workspaceId, meId]);

  useEffect(() => {
    if (!headerFile) {
      setHeaderPreview(null);
      return;
    }
    const url = URL.createObjectURL(headerFile);
    setHeaderPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [headerFile]);

  const current = useMemo(
    () => workspaces.find((w) => w.id === workspaceId),
    [workspaces, workspaceId]
  );
  const selectedBucket = current?.buckets.find((b) => b.id === bucketId);
  const sizeMinutes = {
    tiny: theme.tinyMinutes,
    small: theme.smallMinutes,
    medium: theme.mediumMinutes,
    big: theme.bigMinutes,
  };
  const activeSize = SIZE_KEYS.find((key) => sizeMinutes[key] === estimate) ?? null;

  if (!open) return null;

  function reset() {
    setTitle("");
    setNotes("");
    setPriority(3);
    setEstimate(theme.smallMinutes);
    setBucketId("");
    setDueAt("");
    setEventDate(todayInputValue());
    setEventStart("09:00");
    setEventEnd("10:00");
    setAssigneeId(meId || members[0]?.id || "");
    setMentionIds([]);
    setHeaderFile(null);
    setEmoji(null);
    setDocs([]);
    setIsRecurring(false);
    setRecurByWeekdays([]);
    setMode(isEvent ? "full" : initialMode);
  }

  async function uploadFile(taskId: string, file: File): Promise<string | null> {
    const fd = new FormData();
    fd.set("file", file);
    const res = await apiUpload(`/api/tasks/${taskId}/attachments`, fd);
    if (!res.ok) return null;
    const data = await res.json();
    return data.attachment?.storageKey ?? null;
  }

  async function uploadHeader(taskId: string, file: File): Promise<boolean> {
    const fd = new FormData();
    fd.set("file", file);
    const res = await apiUpload(`/api/tasks/${taskId}/header`, fd);
    return res.ok;
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !workspaceId) return;

    let lockedStart: string | null = null;
    let lockedEnd: string | null = null;
    let estimateMinutes = Math.max(5, estimate);
    if (isEvent) {
      if (!eventDate || !eventStart || !eventEnd) return;
      const start = atLocal(eventDate, eventStart);
      const end = atLocal(eventDate, eventEnd);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;
      if (end.getTime() <= start.getTime()) return;
      lockedStart = start.toISOString();
      lockedEnd = end.toISOString();
      estimateMinutes = Math.max(5, Math.round((end.getTime() - start.getTime()) / 60000));
    }

    setSaving(true);
    try {
      const local = await createLocalTask({
        workspaceId,
        title,
        notes: mode === "full" && notes.trim() && !isEmptyNotesHtml(notes) ? notes : null,
        emoji: mode === "full" ? emoji : null,
        priority,
        estimateMinutes,
        bucketId: bucketId || null,
        assigneeId: assigneeId || meId || null,
        dueAt: !isEvent && dueAt ? atLocal(dueAt, "17:00").toISOString() : null,
        locked: isEvent,
        allowSplit: isEvent ? false : undefined,
        scheduledStart: lockedStart,
        scheduledEnd: lockedEnd,
        isRecurring: isEvent || mode === "full" ? isRecurring : false,
        recurFreq: (isEvent || mode === "full") && isRecurring ? recurFreq : null,
        recurInterval: (isEvent || mode === "full") && isRecurring ? recurInterval : 1,
        recurEndsAt:
          (isEvent || mode === "full") && isRecurring && recurEndsAt
            ? atLocal(recurEndsAt, "23:59").toISOString()
            : null,
        recurCount:
          (isEvent || mode === "full") && isRecurring && recurCount ? Number(recurCount) : null,
        recurByWeekdays:
          (isEvent || mode === "full") && isRecurring && recurFreq === "WEEKLY" && recurByWeekdays.length
            ? recurByWeekdays
            : null,
        mentionIds: mode === "full" && mentionIds.length ? mentionIds : undefined,
      });

      const pendingHeader = headerFile;
      const pendingDocs = [...docs];
      const localId = local.id;
      const doUploads = mode === "full";
      const dest = isEvent ? "/calendar" : "/tasks";

      reset();
      onClose();
      router.push(dest);

      void (async () => {
        try {
          const idMap = await saveAndSync();
          const taskId = idMap[localId] ?? localId;
          if (doUploads && !taskId.startsWith("local_")) {
            if (pendingHeader) {
              const ok = await uploadHeader(taskId, pendingHeader);
              if (ok) {
                const res = await apiFetch(`/api/tasks/${taskId}`);
                if (res.ok) {
                  const data = await res.json();
                  await patchLocalTask(taskId, {
                    headerImageKey: data.task?.headerImageKey ?? null,
                    headerImageUrl: data.task?.headerImageUrl ?? null,
                  });
                }
              }
            }
            for (const doc of pendingDocs) await uploadFile(taskId, doc);
          }
        } catch (err) {
          console.error("post-create sync failed", err);
        }
      })();
    } finally {
      setSaving(false);
    }
  }

  const headerBackground = headerPreview
    ? `center/cover no-repeat url(${headerPreview})`
    : selectedBucket
      ? `linear-gradient(135deg, ${selectedBucket.color}, color-mix(in srgb, ${selectedBucket.color} 55%, var(--accent)))`
      : "linear-gradient(135deg, color-mix(in srgb, var(--brand) 35%, transparent), color-mix(in srgb, var(--accent) 22%, transparent))";

  if (!portalContainer) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 400,
        background: "rgba(10, 16, 12, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        padding: "max(0.75rem, env(safe-area-inset-top)) 0.75rem max(0.75rem, env(safe-area-inset-bottom))",
      }}
      onClick={onClose}
    >
      <form
        className="card rise new-task-modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={create}
        style={{
          width: "min(560px, 100%)",
          margin: "0 auto",
          padding: 0,
          display: "flex",
          flexDirection: "column",
          maxHeight: "min(92dvh, 920px)",
          overflow: "hidden",
        }}
      >
        {mode === "full" && (
          <div
            style={{
              minHeight: headerPreview ? 150 : 96,
              background: headerBackground,
              position: "relative",
              borderTopLeftRadius: "var(--radius)",
              borderTopRightRadius: "var(--radius)",
            }}
          >
            <button
              type="button"
              className="btn ghost"
              onClick={onClose}
              aria-label="Close"
              style={{
                position: "absolute",
                top: "0.55rem",
                right: "0.55rem",
                background: "color-mix(in srgb, var(--bg-elevated) 70%, transparent)",
              }}
            >
              <X size={18} />
            </button>
            <label
              className="btn secondary"
              style={{
                position: "absolute",
                left: "50%",
                bottom: "0.75rem",
                transform: "translateX(-50%)",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              <ImagePlus size={16} /> {headerFile ? "Change header" : "Header image"}
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => setHeaderFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
        )}

        <div
          className="new-task-modal-body"
          style={{
            padding: "1.15rem",
            display: "grid",
            gap: "0.85rem",
            overflowY: "auto",
            flex: 1,
            minHeight: 0,
            paddingBottom: "1.25rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "center" }}>
            <h2 style={{ margin: 0, fontSize: "1.15rem" }}>{isEvent ? "New event" : "New task"}</h2>
            <div style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
              {!isEvent && (
                <>
                  <button
                    type="button"
                    className="btn secondary"
                    style={
                      mode === "simple"
                        ? { background: "color-mix(in srgb, var(--brand) 14%, transparent)" }
                        : undefined
                    }
                    onClick={() => setMode("simple")}
                  >
                    Simple
                  </button>
                  <button
                    type="button"
                    className="btn secondary"
                    style={
                      mode === "full"
                        ? { background: "color-mix(in srgb, var(--brand) 14%, transparent)" }
                        : undefined
                    }
                    onClick={() => setMode("full")}
                  >
                    Full
                  </button>
                </>
              )}
              {(mode === "simple" || isEvent) && (
                <button type="button" className="btn ghost" onClick={onClose} aria-label="Close">
                  <X size={18} />
                </button>
              )}
            </div>
          </div>

          <input
            className="field"
            placeholder={isEvent ? "Event title" : "What needs doing?"}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            required
          />

          {mode === "full" && <EmojiPicker value={emoji} onChange={setEmoji} />}

          <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem" }}>
            Bucket
            <BucketSelect
              buckets={current?.buckets ?? []}
              value={bucketId}
              onChange={setBucketId}
            />
          </label>

          <div>
            <div style={{ fontSize: "0.85rem", marginBottom: "0.35rem" }}>Priority</div>
            <PriorityButtons value={priority} onChange={setPriority} />
          </div>

          {isEvent ? (
            <div style={{ display: "grid", gap: "0.5rem" }}>
              <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.85rem" }}>
                Events lock a fixed time. Other tasks are packed around them, like a break.
              </p>
              <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem" }}>
                Date
                <input
                  className="field"
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  required
                />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem" }}>
                  Starts
                  <input
                    className="field"
                    type="time"
                    value={eventStart}
                    onChange={(e) => setEventStart(e.target.value)}
                    required
                  />
                </label>
                <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem" }}>
                  Ends
                  <input
                    className="field"
                    type="time"
                    value={eventEnd}
                    onChange={(e) => setEventEnd(e.target.value)}
                    required
                  />
                </label>
              </div>
              {mode === "full" && (
                <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem" }}>
                  Assignee
                  <AssigneeSelect
                    members={members}
                    value={assigneeId}
                    onChange={setAssigneeId}
                    meId={meId || members[0]?.id}
                  />
                </label>
              )}
            </div>
          ) : (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: mode === "full" ? "1fr 1fr" : "1fr",
                  gap: "0.5rem",
                }}
              >
                <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem" }}>
                  Due date
                  <DueDatePicker value={dueAt} onChange={setDueAt} />
                </label>
                {mode === "full" && (
                  <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem" }}>
                    Assignee
                    <AssigneeSelect
                      members={members}
                      value={assigneeId}
                      onChange={setAssigneeId}
                      meId={meId || members[0]?.id}
                    />
                  </label>
                )}
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
                      onClick={() => setEstimate(sizeMinutes[key])}
                    >
                      {key[0].toUpperCase() + key.slice(1)} ({sizeMinutes[key]}m)
                    </button>
                  ))}
                </div>
                <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem" }}>
                  Custom (min)
                  <input
                    className="field"
                    type="number"
                    min={5}
                    step={5}
                    value={estimate}
                    onChange={(e) => setEstimate(Number(e.target.value) || 5)}
                  />
                </label>
              </div>
            </>
          )}

          {mode === "full" && (
            <>
              <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem" }}>
                Workspace
                <select
                  className="field"
                  value={workspaceId}
                  onChange={(e) => {
                    setWorkspaceId(e.target.value);
                    setBucketId("");
                    setMentionIds([]);
                  }}
                >
                  {workspaces.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </label>

              <NotesEditor value={notes} onChange={setNotes} />

              {templates.length > 0 && (
                <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem" }}>
                  Start from template
                  <select
                    className="field"
                    defaultValue=""
                    onChange={(e) => {
                      const t = templates.find((x) => x.id === e.target.value);
                      if (!t) return;
                      setTitle(t.title);
                      setPriority(t.priority);
                      setEstimate(t.estimateMinutes);
                    }}
                  >
                    <option value="">None</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <div style={{ display: "grid", gap: "0.5rem" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <input
                    type="checkbox"
                    checked={isRecurring}
                    onChange={(e) => setIsRecurring(e.target.checked)}
                  />
                  <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                    {isEvent ? "Recurring event" : "Recurring task"}
                  </span>
                </label>
                {isRecurring && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                    <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem" }}>
                      Repeats
                      <select
                        className="field"
                        value={recurFreq}
                        onChange={(e) =>
                          setRecurFreq(e.target.value as "DAILY" | "WEEKLY" | "MONTHLY")
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
                        value={recurInterval}
                        onChange={(e) => setRecurInterval(Number(e.target.value) || 1)}
                      />
                    </label>
                    {recurFreq === "WEEKLY" && (
                      <RecurWeekdayPicker value={recurByWeekdays} onChange={setRecurByWeekdays} />
                    )}
                    <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem" }}>
                      Ends on
                      <input
                        className="field"
                        type="date"
                        value={recurEndsAt}
                        onChange={(e) => setRecurEndsAt(e.target.value)}
                      />
                    </label>
                    <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem" }}>
                      Or after (count)
                      <input
                        className="field"
                        type="number"
                        min={1}
                        value={recurCount}
                        onChange={(e) => setRecurCount(e.target.value)}
                        placeholder="Unlimited"
                      />
                    </label>
                  </div>
                )}
              </div>

              {members.length > 0 && (
                <div style={{ display: "grid", gap: "0.5rem" }}>
                  <div style={{ fontSize: "0.85rem", fontWeight: 600 }}>Tag members</div>
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
                          onClick={() =>
                            setMentionIds(
                              on ? mentionIds.filter((id) => id !== m.id) : [...mentionIds, m.id]
                            )
                          }
                        >
                          @{m.name ?? m.email}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div style={{ display: "grid", gap: "0.5rem" }}>
                <div
                  style={{
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    display: "flex",
                    gap: "0.4rem",
                    alignItems: "center",
                  }}
                >
                  <Paperclip size={16} /> Documents
                </div>
                {docs.map((d, index) => (
                  <div key={index} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <span style={{ flex: 1, fontSize: "0.85rem" }}>
                      {d.name}{" "}
                      <span style={{ color: "var(--ink-muted)" }}>
                        ({Math.round(d.size / 1024)} KB)
                      </span>
                    </span>
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => setDocs(docs.filter((_, i) => i !== index))}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                <FileButton
                  label="Attach document"
                  onChange={(files) => {
                    const f = files?.[0];
                    if (f) setDocs([...docs, f]);
                  }}
                />
              </div>
            </>
          )}

          {mode === "simple" && (
            <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem" }}>
              Workspace
              <select
                className="field"
                value={workspaceId}
                onChange={(e) => {
                  setWorkspaceId(e.target.value);
                  setBucketId("");
                }}
              >
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div
          className="new-task-modal-footer"
          style={{
            padding: "0.85rem 1.15rem calc(0.85rem + env(safe-area-inset-bottom, 0px))",
            borderTop: "1px solid var(--line)",
            background: "color-mix(in srgb, var(--card-bg) 92%, transparent)",
            backdropFilter: "blur(10px)",
            flexShrink: 0,
          }}
        >
          <button className="btn" type="submit" disabled={saving} style={{ width: "100%" }}>
            {saving ? "Creating…" : isEvent ? "Create event" : "Create & schedule"}
          </button>
        </div>
      </form>
    </div>,
    portalContainer
  );
}
