"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ListChecks, Maximize2, Minimize2, Plus, SquarePlus, Trash2 } from "lucide-react";

export type ChecklistDraftItem = {
  id?: string;
  text: string;
  done: boolean;
  position?: number;
};

export function ChecklistEditor({
  items,
  onChange,
  meta,
  heading = "Checklist",
  onHeadingChange,
  onMakeTask,
}: {
  items: ChecklistDraftItem[];
  onChange: (next: ChecklistDraftItem[]) => void;
  /** Shown in focus mode so bucket / priority / due stay editable. */
  meta?: ReactNode;
  heading?: string;
  onHeadingChange?: (title: string) => void;
  /** Turn a checklist row into a task (opens add-task with the item name). */
  onMakeTask?: (item: ChecklistDraftItem) => void;
}) {
  const [focused, setFocused] = useState(false);
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);
  const [focusNew, setFocusNew] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  const doneCount = items.filter((i) => i.done).length;

  useEffect(() => {
    setPortalEl(document.body);
  }, []);

  useEffect(() => {
    if (!focused) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFocused(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [focused]);

  useEffect(() => {
    if (!focusNew) return;
    const root = listRef.current;
    const fields = root?.querySelectorAll<HTMLInputElement>("input.field");
    const last = fields?.[fields.length - 1];
    last?.focus();
    last?.select();
    setFocusNew(false);
  }, [items.length, focusNew]);

  function patch(index: number, next: Partial<ChecklistDraftItem>) {
    onChange(items.map((item, i) => (i === index ? { ...item, ...next } : item)));
  }

  function addItem() {
    onChange([...items, { text: "", done: false }]);
    setFocusNew(true);
  }

  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  function onItemKeyDown(e: React.KeyboardEvent<HTMLInputElement>, index: number) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (index === items.length - 1) addItem();
      else {
        const fields = listRef.current?.querySelectorAll<HTMLInputElement>("input.field");
        fields?.[index + 1]?.focus();
      }
    }
  }

  function renderList() {
    return (
      <div ref={listRef} className={focused ? "checklist-focus-list" : "checklist-compact-list"}>
        {items.length === 0 && (
          <p className="checklist-empty">No items yet — add the first step.</p>
        )}
        {items.map((item, index) => (
          <div key={item.id ?? `row-${index}`} className="checklist-row">
            <input
              type="checkbox"
              checked={item.done}
              aria-label={item.text ? `Done: ${item.text}` : "Mark item done"}
              onChange={(e) => patch(index, { done: e.target.checked })}
            />
            <input
              className="field"
              value={item.text}
              placeholder="Checklist item"
              onChange={(e) => patch(index, { text: e.target.value })}
              onKeyDown={(e) => onItemKeyDown(e, index)}
              style={item.done ? { textDecoration: "line-through", opacity: 0.72 } : undefined}
            />
            {onMakeTask ? (
              <button
                type="button"
                className="btn ghost"
                aria-label="Make this item a task"
                title="Make task"
                disabled={!item.text.trim()}
                onClick={() => onMakeTask(item)}
              >
                <SquarePlus size={16} />
              </button>
            ) : null}
            <button
              type="button"
              className="btn ghost"
              aria-label="Remove item"
              onClick={() => removeItem(index)}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <button type="button" className="btn secondary" onClick={addItem}>
          <Plus size={16} /> Add checklist item
        </button>
      </div>
    );
  }

  const header = (inFocus: boolean) => (
    <div className="checklist-head">
      <div className="checklist-head-title">
        <ListChecks size={18} color="var(--brand)" />
        {onHeadingChange ? (
          <input
            className="field"
            value={heading}
            onChange={(e) => onHeadingChange(e.target.value)}
            aria-label="Checklist title"
            style={{ fontWeight: 650, fontSize: "1rem" }}
          />
        ) : (
          <h2>{heading}</h2>
        )}
        <span className="badge">
          {items.length ? `${doneCount}/${items.length}` : "Empty"}
        </span>
      </div>
      <button
        type="button"
        className="btn secondary"
        onClick={() => setFocused(!inFocus)}
        aria-expanded={inFocus}
        aria-label={inFocus ? "Exit focus mode" : "Open checklist focus mode"}
      >
        {inFocus ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        {inFocus ? "Exit focus" : "Focus"}
      </button>
    </div>
  );

  return (
    <>
      {!focused && (
        <section className="card checklist-section">
          {header(false)}
          {renderList()}
        </section>
      )}

      {focused &&
        portalEl &&
        createPortal(
          <div className="checklist-focus" role="dialog" aria-modal="true" aria-label="Checklist focus">
            {header(true)}
            {meta ? <div className="checklist-focus-meta">{meta}</div> : null}
            {renderList()}
          </div>,
          portalEl
        )}
    </>
  );
}
