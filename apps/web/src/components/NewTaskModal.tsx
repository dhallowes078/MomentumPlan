"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ImagePlus, Link2, Paperclip, Plus, Trash2, X } from "lucide-react";
import { useThemePrefs } from "@/components/ThemeProvider";
import { PriorityButtons } from "@/components/PriorityButtons";
import { BucketSelect } from "@/components/BucketSelect";
import { DueDatePicker } from "@/components/DueDatePicker";
import { AssigneeSelect } from "@/components/AssigneeSelect";
import { FileButton } from "@/components/FileButton";
import { EmojiPicker } from "@/components/EmojiPicker";
import { createLocalTask } from "@/lib/local/repo";
import { flushOutbox, pullFromServer } from "@/lib/local/sync";

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

type ChecklistDraft = { text: string; done: boolean };
type LinkDraft = { url: string; title?: string };
type Mode = "simple" | "full";

const SIZE_KEYS = ["tiny", "small", "medium", "big"] as const;

export function NewTaskModal({
  open,
  onClose,
  initialMode = "full",
}: {
  open: boolean;
  onClose: () => void;
  initialMode?: Mode;
}) {
  const router = useRouter();
  const theme = useThemePrefs();
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
  const [assigneeId, setAssigneeId] = useState("");
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [checklist, setChecklist] = useState<ChecklistDraft[]>([]);
  const [links, setLinks] = useState<LinkDraft[]>([]);
  const [linkUrl, setLinkUrl] = useState("");
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
  const [templates, setTemplates] = useState<
    Array<{ id: string; name: string; title: string; priority: number; estimateMinutes: number }>
  >([]);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalContainer(document.body);
  }, []);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
  }, [open, initialMode]);

  useEffect(() => {
    if (!open) return;
    void fetch("/api/workspaces")
      .then((r) => r.json())
      .then((data) => {
        setWorkspaces(data.workspaces ?? []);
        setWorkspaceId((prev) => prev || data.workspaces?.[0]?.id || "");
      });
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
    void fetch(`/api/workspaces/${workspaceId}`)
      .then((r) => r.json())
      .then((data) => {
        setMembers(
          (data.workspace?.members ?? []).map((m: { user: Member }) => m.user)
        );
      });
    void fetch(`/api/templates?workspaceId=${workspaceId}`)
      .then((r) => r.json())
      .then((data) => setTemplates(data.templates ?? []));
  }, [workspaceId]);

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
    setAssigneeId("");
    setMentionIds([]);
    setChecklist([]);
    setLinks([]);
    setLinkUrl("");
    setHeaderFile(null);
    setEmoji(null);
    setDocs([]);
  }

  async function uploadFile(taskId: string, file: File): Promise<string | null> {
    const fd = new FormData();
    fd.set("file", file);
    const res = await fetch(`/api/tasks/${taskId}/attachments`, {
      method: "POST",
      body: fd,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.attachment?.storageKey ?? null;
  }

  async function uploadHeader(taskId: string, file: File): Promise<boolean> {
    const fd = new FormData();
    fd.set("file", file);
    const res = await fetch(`/api/tasks/${taskId}/header`, {
      method: "POST",
      body: fd,
    });
    return res.ok;
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !workspaceId) return;
    setSaving(true);

    const local = await createLocalTask({
      workspaceId,
      title,
      notes: mode === "full" && notes.trim() ? notes : null,
      emoji: mode === "full" ? emoji : null,
      priority,
      estimateMinutes: Math.max(5, estimate),
      bucketId: bucketId || null,
      assigneeId: mode === "full" && assigneeId ? assigneeId : null,
      dueAt: dueAt ? new Date(`${dueAt}T17:00:00`).toISOString() : null,
      links: mode === "full" && links.length ? links : undefined,
      isRecurring: mode === "full" ? isRecurring : false,
      recurFreq: mode === "full" && isRecurring ? recurFreq : null,
      recurInterval: mode === "full" && isRecurring ? recurInterval : 1,
      recurEndsAt:
        mode === "full" && isRecurring && recurEndsAt
          ? new Date(`${recurEndsAt}T23:59:59`).toISOString()
          : null,
      recurCount:
        mode === "full" && isRecurring && recurCount ? Number(recurCount) : null,
      checklist: mode === "full" ? checklist.filter((c) => c.text.trim()) : undefined,
      mentionIds: mode === "full" && mentionIds.length ? mentionIds : undefined,
    });

    await flushOutbox();
    await pullFromServer();

    const { getTask } = await import("@/lib/local/repo");
    const { localDb } = await import("@/lib/local/db");
    let taskId = local.id;
    const stillLocal = await getTask(local.id);
    if (!stillLocal || stillLocal._localOnly) {
      const all = await localDb.tasks.where("workspaceId").equals(workspaceId).toArray();
      const match = all.find((t) => t.title === local.title && !t._localOnly);
      if (match) taskId = match.id;
    } else {
      taskId = stillLocal.id;
    }

    if (mode === "full" && !taskId.startsWith("local_")) {
      if (headerFile) {
        await uploadHeader(taskId, headerFile);
      }
      for (const doc of docs) {
        await uploadFile(taskId, doc);
      }
    }

    setSaving(false);
    reset();
    onClose();
    if (!taskId.startsWith("local_")) {
      router.push(`/tasks/${taskId}`);
    } else {
      router.push("/tasks");
    }
    router.refresh();
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
        zIndex: 200,
        background: "rgba(10, 16, 12, 0.45)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        overflowY: "auto",
        padding: "max(1rem, 4vh) 1rem",
      }}
      onClick={onClose}
    >
      <form
        className="card rise"
        onClick={(e) => e.stopPropagation()}
        onSubmit={create}
        style={{
          width: "min(560px, 100%)",
          margin: "0 auto",
          padding: 0,
          display: "grid",
          gap: 0,
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

        <div style={{ padding: "1.15rem", display: "grid", gap: "0.85rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "center" }}>
            <h2 style={{ margin: 0, fontSize: "1.15rem" }}>New task</h2>
            <div style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
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
              {mode === "simple" && (
                <button type="button" className="btn ghost" onClick={onClose} aria-label="Close">
                  <X size={18} />
                </button>
              )}
            </div>
          </div>

          <input
            className="field"
            placeholder="What needs doing?"
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

          <div style={{ display: "grid", gridTemplateColumns: mode === "full" ? "1fr 1fr" : "1fr", gap: "0.5rem" }}>
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
                    setAssigneeId("");
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

              <textarea
                className="field"
                rows={3}
                placeholder="Notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />

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
                  <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>Recurring task</span>
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

              <div style={{ display: "grid", gap: "0.5rem" }}>
                <div style={{ fontSize: "0.85rem", fontWeight: 600 }}>Checklist</div>
                {checklist.map((item, index) => (
                  <div key={index} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={item.done}
                      onChange={(e) =>
                        setChecklist(
                          checklist.map((c, i) =>
                            i === index ? { ...c, done: e.target.checked } : c
                          )
                        )
                      }
                    />
                    <input
                      className="field"
                      value={item.text}
                      onChange={(e) =>
                        setChecklist(
                          checklist.map((c, i) =>
                            i === index ? { ...c, text: e.target.value } : c
                          )
                        )
                      }
                    />
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => setChecklist(checklist.filter((_, i) => i !== index))}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setChecklist([...checklist, { text: "New item", done: false }])}
                >
                  <Plus size={16} /> Add checklist item
                </button>
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
                  <Link2 size={16} /> Links
                </div>
                {links.map((l, index) => (
                  <div key={index} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <span
                      style={{
                        flex: 1,
                        fontSize: "0.85rem",
                        color: "var(--brand)",
                        wordBreak: "break-all",
                      }}
                    >
                      {l.url}
                    </span>
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => setLinks(links.filter((_, i) => i !== index))}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                <div style={{ display: "flex", gap: "0.4rem" }}>
                  <input
                    className="field"
                    placeholder="https://"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => {
                      const url = linkUrl.trim();
                      if (!url) return;
                      setLinks([...links, { url }]);
                      setLinkUrl("");
                    }}
                  >
                    Add
                  </button>
                </div>
              </div>

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

          <button className="btn" type="submit" disabled={saving}>
            {saving ? "Creating…" : "Create & schedule"}
          </button>
        </div>
      </form>
    </div>,
    portalContainer
  );
}
