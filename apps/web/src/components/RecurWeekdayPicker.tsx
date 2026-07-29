"use client";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Compact weekday multi-select for weekly recurrence. */
export function RecurWeekdayPicker({
  value,
  onChange,
}: {
  value: number[];
  onChange: (days: number[]) => void;
}) {
  const selected = new Set(value);

  return (
    <div style={{ display: "grid", gap: "0.35rem", gridColumn: "1 / -1" }}>
      <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>On days</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
        {DAY_LABELS.map((label, idx) => {
          const on = selected.has(idx);
          return (
            <button
              key={label}
              type="button"
              className="btn secondary"
              style={
                on
                  ? { background: "color-mix(in srgb, var(--brand) 14%, transparent)" }
                  : undefined
              }
              onClick={() => {
                const next = on
                  ? value.filter((d) => d !== idx)
                  : [...value, idx].sort((a, b) => a - b);
                onChange(next);
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
      <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.78rem" }}>
        Leave all off to repeat on the same weekday as the due date / event.
      </p>
    </div>
  );
}
