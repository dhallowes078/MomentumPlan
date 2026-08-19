"use client";

import { useEffect, useMemo, useState } from "react";
import { ListChecks, Plus, Trash2 } from "lucide-react";
import { ChecklistEditor, type ChecklistDraftItem } from "@/components/ChecklistEditor";
import { NewTaskModal } from "@/components/NewTaskModal";
import { useLocalChecklists, useLocalWorkspaces } from "@/lib/local/hooks";
import * as repo from "@/lib/local/repo";
import { saveAndSync } from "@/lib/local/sync";
import type { LocalChecklistItem } from "@/lib/local/db";

function toDraftItems(items: LocalChecklistItem[]): ChecklistDraftItem[] {
  return items.map((item, i) => ({
    id: item.id,
    text: item.text,
    done: Boolean(item.done),
    position: item.position ?? i,
  }));
}

export default function ChecklistsPage() {
  const workspaces = useLocalWorkspaces();
  const [workspaceId, setWorkspaceId] = useState("");
  const lists = useLocalChecklists(workspaceId);
  const [taskTitle, setTaskTitle] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId && workspaces[0]?.id) setWorkspaceId(workspaces[0].id);
  }, [workspaces, workspaceId]);

  const ordered = useMemo(
    () => [...lists].sort((a, b) => a.position - b.position || a.title.localeCompare(b.title)),
    [lists]
  );

  async function persist(
    id: string,
    patch: { title?: string; items?: ChecklistDraftItem[] }
  ) {
    const current = lists.find((l) => l.id === id);
    if (!current) return;
    await repo.upsertLocalChecklist({
      id: current.id,
      workspaceId: current.workspaceId,
      title: patch.title ?? current.title,
      items: (patch.items ?? current.items).map((item, i) => ({
        id: item.id,
        text: item.text,
        done: Boolean(item.done),
        position: i,
      })),
      position: current.position,
    });
    void saveAndSync();
  }

  async function addList() {
    if (!workspaceId) return;
    await repo.upsertLocalChecklist({
      workspaceId,
      title: "New checklist",
      items: [{ text: "", done: false, position: 0 }],
      position: ordered.length,
    });
    void saveAndSync();
  }

  async function removeList(id: string) {
    const list = lists.find((l) => l.id === id);
    if (!list) return;
    const ok = window.confirm(`Delete “${list.title}”?`);
    if (!ok) return;
    await repo.deleteLocalChecklist(id);
    void saveAndSync();
  }

  return (
    <div className="page-wrap rise">
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
        ordered.map((list) => (
          <div key={list.id} style={{ display: "grid", gap: "0.4rem" }}>
            <ChecklistEditor
              heading={list.title}
              onHeadingChange={(title) => void persist(list.id, { title })}
              items={toDraftItems(list.items)}
              onChange={(items) => void persist(list.id, { items })}
              onMakeTask={(item) => {
                const name = item.text.trim();
                if (name) setTaskTitle(name);
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn ghost"
                onClick={() => void removeList(list.id)}
                aria-label={`Delete ${list.title}`}
              >
                <Trash2 size={16} /> Delete list
              </button>
            </div>
          </div>
        ))
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
