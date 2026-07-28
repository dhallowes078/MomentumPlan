"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { CalendarClock, CheckSquare, X } from "lucide-react";

export function CreateChooser({
  open,
  onClose,
  onPickTask,
  onPickEvent,
}: {
  open: boolean;
  onClose: () => void;
  onPickTask: () => void;
  onPickEvent: () => void;
}) {
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setPortalContainer(document.body);
  }, []);

  if (!open || !portalContainer) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Create"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "color-mix(in srgb, #000 45%, transparent)",
        display: "grid",
        placeItems: "center",
        padding: "1rem",
      }}
      onClick={onClose}
    >
      <div
        className="card rise"
        style={{ width: "min(380px, 100%)", padding: "1.15rem", display: "grid", gap: "0.75rem" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Create</h2>
          <button type="button" className="btn ghost" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.9rem" }}>
          Tasks are packed around your day. Events lock a fixed time that other work plans around.
        </p>
        <button
          type="button"
          className="btn"
          style={{ justifyContent: "flex-start", gap: "0.65rem" }}
          onClick={() => {
            onClose();
            onPickTask();
          }}
        >
          <CheckSquare size={18} /> New task
        </button>
        <button
          type="button"
          className="btn secondary"
          style={{ justifyContent: "flex-start", gap: "0.65rem" }}
          onClick={() => {
            onClose();
            onPickEvent();
          }}
        >
          <CalendarClock size={18} /> New event
        </button>
      </div>
    </div>,
    portalContainer
  );
}
