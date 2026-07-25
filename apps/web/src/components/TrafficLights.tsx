"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { formatMinutes, priorityColor } from "@/lib/format";
import { cachedJson } from "@/lib/client-fetch";

type StatusTask = {
  id: string;
  title: string;
  priority: number;
  estimateMinutes: number;
  dueAt?: string | null;
  bucket?: { name: string; color: string } | null;
};

type Status = {
  onTime: number;
  pushed: number;
  overdue: number;
  tasks: {
    onTime: StatusTask[];
    pushed: StatusTask[];
    overdue: StatusTask[];
  };
};

type Filter = "onTime" | "pushed" | "overdue";

export function TrafficLights() {
  const [status, setStatus] = useState<Status>({
    onTime: 0,
    pushed: 0,
    overdue: 0,
    tasks: { onTime: [], pushed: [], overdue: [] },
  });
  const [open, setOpen] = useState<Filter | null>(null);

  const load = useCallback(async (force = false) => {
    try {
      const data = await cachedJson<Status>("/api/status", {
        softTtlMs: 30_000,
        force,
      });
      setStatus(data);
    } catch {
      // ignore while signed out / booting
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(true), 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  const lights = [
    {
      key: "onTime" as const,
      count: status.onTime,
      color: "#2f9e44",
      label: "On time",
      title: "Tasks still on track for their plan",
    },
    {
      key: "pushed" as const,
      count: status.pushed,
      color: "#e6a817",
      label: "Pushed",
      title: "Tasks moved later than their original slot",
    },
    {
      key: "overdue" as const,
      count: status.overdue,
      color: "#d9480f",
      label: "Overdue",
      title: "Tasks past their due date",
    },
  ];

  const list = open ? status.tasks[open] : [];
  const active = lights.find((l) => l.key === open);

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.55rem",
          flexWrap: "wrap",
          justifyContent: "center",
        }}
        aria-label="Task traffic lights"
      >
        {lights.map((light) => (
          <button
            key={light.key}
            type="button"
            title={`${light.title}: ${light.count}`}
            onClick={() => setOpen(light.key)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              padding: "0.2rem 0.55rem",
              borderRadius: 999,
              border: "1px solid var(--line)",
              background: "color-mix(in srgb, var(--bg-elevated) 80%, transparent)",
              fontSize: "0.78rem",
              fontWeight: 650,
              cursor: "pointer",
              color: "inherit",
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: light.color,
                boxShadow: `0 0 0 3px color-mix(in srgb, ${light.color} 22%, transparent)`,
              }}
            />
            <span style={{ color: "var(--ink-muted)" }}>{light.label}</span>
            <span>{light.count}</span>
          </button>
        ))}
      </div>

      {open && active && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 90,
            background: "rgba(10, 16, 12, 0.45)",
            display: "grid",
            placeItems: "center",
            padding: "1rem",
          }}
          onClick={() => setOpen(null)}
        >
          <div
            className="card rise"
            style={{
              width: "min(480px, 100%)",
              maxHeight: "80dvh",
              overflow: "auto",
              padding: "1.1rem",
              display: "grid",
              gap: "0.75rem",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    background: active.color,
                  }}
                />
                <h2 style={{ margin: 0, fontSize: "1.1rem" }}>
                  {active.label} · {list.length}
                </h2>
              </div>
              <button type="button" className="btn ghost" onClick={() => setOpen(null)}>
                <X size={18} />
              </button>
            </div>
            {list.length === 0 ? (
              <p style={{ margin: 0, color: "var(--ink-muted)" }}>No tasks in this lane.</p>
            ) : (
              <div style={{ display: "grid", gap: "0.45rem" }}>
                {list.map((t) => (
                  <Link
                    key={t.id}
                    href={`/tasks/${t.id}`}
                    onClick={() => setOpen(null)}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "auto 1fr auto",
                      gap: "0.65rem",
                      alignItems: "center",
                      padding: "0.65rem 0.7rem",
                      borderRadius: 10,
                      border: "1px solid var(--line)",
                      borderLeft: t.bucket ? `4px solid ${t.bucket.color}` : undefined,
                    }}
                  >
                    <span
                      className="priority-dot"
                      style={{ background: priorityColor(t.priority) }}
                    />
                    <div>
                      <div style={{ fontWeight: 600 }}>{t.title}</div>
                      <div style={{ fontSize: "0.8rem", color: "var(--ink-muted)" }}>
                        P{t.priority} · {formatMinutes(t.estimateMinutes)}
                        {t.bucket ? ` · ${t.bucket.name}` : ""}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
