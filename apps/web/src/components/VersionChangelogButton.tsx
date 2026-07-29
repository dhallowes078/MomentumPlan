"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { APP_VERSION, CHANGELOG } from "@/lib/version";

/** Clickable app version that opens a short changelog sheet. */
export function VersionChangelogButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [portal, setPortal] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortal(document.body);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => setOpen(true)}
        title="What's new — tap for changelog"
        style={{
          fontSize: "0.78rem",
          color: "var(--ink-muted)",
          fontVariantNumeric: "tabular-nums",
          background: "transparent",
          border: "1px solid var(--line)",
          borderRadius: 999,
          padding: "0.28rem 0.65rem",
          cursor: "pointer",
        }}
      >
        v{APP_VERSION}
      </button>

      {open &&
        portal &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Changelog"
            onClick={() => setOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 80,
              background: "rgba(20, 36, 28, 0.45)",
              display: "grid",
              placeItems: "center",
              padding: "1.25rem",
            }}
          >
            <div
              className="card"
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "min(440px, 100%)",
                maxHeight: "min(70dvh, 560px)",
                display: "grid",
                gridTemplateRows: "auto 1fr auto",
                overflow: "hidden",
                padding: 0,
              }}
            >
              <div
                style={{
                  padding: "1rem 1.15rem 0.65rem",
                  borderBottom: "1px solid var(--line)",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-display), serif",
                    fontSize: "1.35rem",
                    fontWeight: 650,
                  }}
                >
                  What’s new
                </div>
                <p style={{ margin: "0.25rem 0 0", color: "var(--ink-muted)", fontSize: "0.85rem" }}>
                  Current version v{APP_VERSION}
                </p>
              </div>

              <div
                style={{
                  overflowY: "auto",
                  padding: "0.85rem 1.15rem",
                  display: "grid",
                  gap: "1rem",
                }}
              >
                {CHANGELOG.map((entry) => (
                  <section key={entry.version} style={{ display: "grid", gap: "0.4rem" }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "0.75rem",
                        alignItems: "baseline",
                      }}
                    >
                      <strong style={{ fontVariantNumeric: "tabular-nums" }}>
                        v{entry.version}
                      </strong>
                      <span style={{ fontSize: "0.78rem", color: "var(--ink-muted)" }}>
                        {entry.date}
                      </span>
                    </div>
                    <ul
                      style={{
                        margin: 0,
                        paddingLeft: "1.15rem",
                        display: "grid",
                        gap: "0.3rem",
                        color: "var(--ink)",
                        fontSize: "0.9rem",
                        lineHeight: 1.4,
                      }}
                    >
                      {entry.changes.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>

              <div style={{ padding: "0.75rem 1.15rem 1rem", borderTop: "1px solid var(--line)" }}>
                <button
                  type="button"
                  className="btn secondary"
                  style={{ width: "100%" }}
                  onClick={() => setOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>,
          portal
        )}
    </>
  );
}
