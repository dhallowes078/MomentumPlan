"use client";

type Member = {
  id: string;
  name: string | null;
  email: string;
  image?: string | null;
  color?: string | null;
};

export function AssigneeSelect({
  members,
  value,
  onChange,
  meId,
}: {
  members: Member[];
  value: string;
  onChange: (id: string) => void;
  meId?: string;
}) {
  const selected = members.find((m) => m.id === value);

  return (
    <div style={{ position: "relative" }}>
      {selected && (
        <span
          style={{
            position: "absolute",
            left: 10,
            top: "50%",
            transform: "translateY(-50%)",
            width: 18,
            height: 18,
            borderRadius: "50%",
            overflow: "hidden",
            background: selected.color || "var(--brand)",
            display: "grid",
            placeItems: "center",
            fontSize: 9,
            color: "#fff",
            zIndex: 1,
            pointerEvents: "none",
          }}
        >
          {selected.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={selected.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            (selected.name ?? selected.email).slice(0, 1).toUpperCase()
          )}
        </span>
      )}
      <select
        className="field"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ paddingLeft: selected ? "2.1rem" : undefined }}
      >
        <option value="">Unassigned</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {meId && m.id === meId ? "Me" : (m.name ?? m.email)}
          </option>
        ))}
      </select>
    </div>
  );
}
