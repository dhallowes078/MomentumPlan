"use client";

const COLORS = ["#4a5c52", "#2f6b50", "#b7791f", "#c45c26", "#a33b2d"];

export function PriorityButtons({
  value,
  onChange,
}: {
  value: number;
  onChange: (priority: number) => void;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
      {[1, 2, 3, 4, 5].map((priority) => {
        const on = value === priority;
        const color = COLORS[priority - 1];
        return (
          <button
            key={priority}
            type="button"
            className="btn secondary"
            onClick={() => onChange(priority)}
            style={{
              background: on ? `color-mix(in srgb, ${color} 22%, transparent)` : undefined,
              borderColor: on ? color : undefined,
              color: on ? color : undefined,
              minWidth: 40,
            }}
          >
            {priority}
          </button>
        );
      })}
    </div>
  );
}
