"use client";

type Bucket = { id: string; name: string; color: string };

export function BucketSelect({
  buckets,
  value,
  onChange,
  allowNone = true,
}: {
  buckets: Bucket[];
  value: string;
  onChange: (id: string) => void;
  allowNone?: boolean;
}) {
  const selected = buckets.find((b) => b.id === value);

  return (
    <div style={{ position: "relative" }}>
      {selected && (
        <span
          className="bucket-swatch"
          style={{
            background: selected.color,
            position: "absolute",
            left: 12,
            top: "50%",
            transform: "translateY(-50%)",
            zIndex: 1,
            pointerEvents: "none",
          }}
        />
      )}
      <select
        className="field"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ paddingLeft: selected || allowNone ? "1.85rem" : undefined }}
      >
        {allowNone && <option value="">None</option>}
        {/* Keep a selection visible if the id was wiped from the list mid-sync. */}
        {value && !selected && (
          <option value={value}>Unknown bucket</option>
        )}
        {buckets.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    </div>
  );
}
