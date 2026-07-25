"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parse,
  startOfMonth,
  startOfWeek,
} from "date-fns";

function toInputDate(d: Date) {
  return format(d, "yyyy-MM-dd");
}

function parseLoose(text: string): Date | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (iso.test(trimmed)) {
    const d = new Date(`${trimmed}T12:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  for (const pattern of ["d MMM yyyy", "MMM d yyyy", "d/M/yyyy", "M/d/yyyy"]) {
    try {
      const d = parse(trimmed, pattern, new Date());
      if (!Number.isNaN(d.getTime())) return d;
    } catch {
      // continue
    }
  }
  const fallback = new Date(trimmed);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

export function DueDatePicker({
  value,
  onChange,
}: {
  value: string; // yyyy-MM-dd or ""
  onChange: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value ? format(new Date(`${value}T12:00:00`), "d MMM yyyy") : "");
  const [month, setMonth] = useState(() =>
    value ? new Date(`${value}T12:00:00`) : new Date()
  );
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setText(value ? format(new Date(`${value}T12:00:00`), "d MMM yyyy") : "");
    if (value) setMonth(new Date(`${value}T12:00:00`));
  }, [value]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [month]);

  const selected = value ? new Date(`${value}T12:00:00`) : null;

  function commitText() {
    if (!text.trim()) {
      onChange("");
      return;
    }
    const parsed = parseLoose(text);
    if (!parsed) return;
    onChange(toInputDate(parsed));
    setMonth(parsed);
  }

  return (
    <div ref={root} style={{ position: "relative", display: "grid", gap: "0.35rem" }}>
      <input
        className="field"
        placeholder="e.g. 25 Jul 2026"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={commitText}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitText();
          }
        }}
      />
      {open && (
        <div
          className="card"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            zIndex: 30,
            width: "min(280px, 100vw - 2rem)",
            padding: "0.75rem",
            display: "grid",
            gap: "0.55rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button type="button" className="btn ghost" onClick={() => setMonth(addMonths(month, -1))}>
              ‹
            </button>
            <strong style={{ fontSize: "0.9rem" }}>{format(month, "MMMM yyyy")}</strong>
            <button type="button" className="btn ghost" onClick={() => setMonth(addMonths(month, 1))}>
              ›
            </button>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: "0.2rem",
              textAlign: "center",
              fontSize: "0.72rem",
              color: "var(--ink-muted)",
            }}
          >
            {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
              <div key={d}>{d}</div>
            ))}
            {days.map((day) => {
              const inMonth = isSameMonth(day, month);
              const isSelected = selected ? isSameDay(day, selected) : false;
              const isToday = isSameDay(day, new Date());
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => {
                    onChange(toInputDate(day));
                    setOpen(false);
                  }}
                  style={{
                    border: "none",
                    borderRadius: 8,
                    padding: "0.4rem 0",
                    cursor: "pointer",
                    background: isSelected
                      ? "var(--brand)"
                      : isToday
                        ? "color-mix(in srgb, var(--brand) 16%, transparent)"
                        : "transparent",
                    color: isSelected
                      ? "#f4f7f4"
                      : inMonth
                        ? "var(--ink)"
                        : "var(--ink-muted)",
                    opacity: inMonth ? 1 : 0.45,
                    fontWeight: isSelected || isToday ? 700 : 500,
                  }}
                >
                  {format(day, "d")}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="btn secondary"
            onClick={() => {
              onChange("");
              setText("");
              setOpen(false);
            }}
          >
            Clear date
          </button>
        </div>
      )}
    </div>
  );
}
