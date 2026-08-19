"use client";

import { useEffect, useMemo, useState } from "react";
import { ListChecks, Plus, Trash2 } from "lucide-react";
import { ChecklistEditor, type ChecklistDraftItem } from "@/components/ChecklistEditor";
import { NewTaskModal } from "@/components/NewTaskModal";
import { useLocalChecklists, useLocalWorkspaces } from "@/lib/local/hooks";
import * as repo from "@/lib/local/repo";
import { saveAndSync } from "@/lib/local/sync";
import type { LocalChecklist, LocalChecklistItem } from "@/lib/local/db";

type Draft = { title: string; items: ChecklistDraftItem[] };

function toDraftItems(items: LocalChecklistItem[]): ChecklistDraftItem[] {
  return items.map((item, i) => ({
    id: item.id,
    text: item.text,
    done: Boolean(item.done),
    position: item.position ?? i,
  }));
}

function sameDraft(a: Draft, b: Draft) {
  if (a.title !== b.title || a.items.length !== b.items.length) return false;
  return a.items.every(
    (item, i) =>
      item.text === b.items[i].text &&
      item.done === b.items[i].done &&
      (item.id ?? "") === (b.items[i].id ?? "")
  );
}

export default function ChecklistsPage() {
  const workspaces = useLocalWorkspaces();
  const [workspaceId, setWorkspaceId] = useState("");
  const lists = useLocalChecklists(workspaceId);
  const [taskTitle, setTaskTitle] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!workspaceId && workspaces[0]?.id) setWorkspaceId(workspaces[0].id);
  }, [workspaces, workspaceId]);

  const ordered = useMemo(
    () => [...lists].sort((a, b) => a.position - b.position || a.title.localeCompare(b.title)),
    [lists]
  );

  function storedDraft(list: LocalChecklist): Draft {
    return { title: list.title, items: toDraftItems(list.items) };
  }

  function draftFor(list: LocalChecklist): Draft {
    return drafts[list.id] ?? storedDraft(list);
  }

  function isDirty(list: LocalChecklist) {
    if (list.id.startsWith("local_list_") || list._localOnly) return true;
    const draft = drafts[list.id];
    if (!draft) return false;
    return !sameDraft(draft, storedDraft(list));
  }

  const dirtyLists = ordered.filter(isDirty);

  function updateDraft(list: LocalChecklist, patch: Partial<Draft>) {
    setDrafts((prev) => {
      const base = prev[list.id] ?? storedDraft(list);
      return { ...prev, [list.id]: { ...base, ...patch } };
    });
  }

  async function saveList(list: LocalChecklist) {
    const draft = draftFor(list);
    await repo.upsertLocalChecklist({
      id: list.id,
      workspaceId: list.workspaceId,
      title: draft.title.trim() || "Checklist",
      items: draft.items.map((item, i) => ({
        id: item.id,
        text: item.text,
        done: Boolean(item.done),
        position: i,
      })),
      position: list.position,
    });
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[list.id];
      return next;
    });
  }

  async function saveChanges() {
    if (!dirtyLists.length) return;
    setSaving(true);
    try {
      for (const list of dirtyLists) await saveList(list);
      await saveAndSync();
    } finally {
      setSaving(false);
    }
  }

  async function addList() {
    if (!workspaceId) return;
    const row = await repo.upsertLocalChecklist(
      {
        workspaceId,
        title: "New checklist",
        items: [{ id: `row_${Date.now()}`, text: "", done: false, position: 0 }],
        position: ordered.length,
      },
      { enqueue: false }
    );
    setDrafts((prev) => ({
      ...prev,
      [row.id]: { title: row.title, items: toDraftItems(row.items) },
    }));
  }

  async function removeList(id: string) {
    const list = lists.find((l) => l.id === id);
    if (!list) return;
    const ok = window.confirm(`Delete “${draftFor(list).title || list.title}”?`);
    if (!ok) return;
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    await repo.deleteLocalChecklist(id);
    void saveAndSync();
  }

  return (
    <div className="page-wrap rise">
      {dirtyLists.length > 0 && (
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

      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.35rem" }}>Checklists</h1>
          <p style={{ margin: "0.25rem 0 0", color: "var(--ink-muted)", fontSize: "0.9rem" }}>
            Separate from tasks. Turn any item into a task when you’re ready.
          </p>
        </div>
        <button className="btn" type="button" onClick={() => void addList()} disabled={!workspaceId}>
          <Plus size={16} /> New checklist
        </button>
      </div>

      {workspaces.length > 1 && (
        <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem", maxWidth: 280 }}>
          Workspace
          <select className="field" value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)}>
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {ordered.length === 0 ? (
        <section className="card" style={{ padding: "1.1rem", display: "grid", gap: "0.55rem" }}>
          <ListChecks size={22} color="var(--brand)" />
          <p style={{ margin: 0, color: "var(--ink-muted)" }}>
            No checklists yet. Add one for packing, shopping, or a repeating process.
          </p>
        </section>
      ) : (
        ordered.map((list) => {
          const draft = draftFor(list);
          return (
            <div key={list.id} style={{ display: "grid", gap: "0.4rem" }}>
              <ChecklistEditor
                heading={draft.title}
                onHeadingChange={(title) => updateDraft(list, { title })}
                items={draft.items}
                onChange={(items) => updateDraft(list, { items })}
                onMakeTask={(item) => {
                  const name = item.text.trim();
                  if (name) setTaskTitle(name);
                }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.4rem" }}>
                {isDirty(list) && (
                  <button
                    type="button"
                    className="btn"
                    disabled={saving}
                    onClick={() => void saveChanges()}
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                )}
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => void removeList(list.id)}
                  aria-label={`Delete ${draft.title}`}
                >
                  <Trash2 size={16} /> Delete list
                </button>
              </div>
            </div>
          );
        })
      )}

      <NewTaskModal
        open={taskTitle != null}
        initialTitle={taskTitle ?? ""}
        initialMode="full"
        variant="task"
        onClose={() => setTaskTitle(null)}
      />
    </div>
  );
}
