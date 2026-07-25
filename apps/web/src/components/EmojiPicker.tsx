"use client";

const PICKS = [
  "🎯", "🚀", "💡", "📝", "✅", "🔥", "⭐", "📌",
  "💼", "🏠", "🛒", "📞", "✉️", "📅", "🏃", "🧠",
  "🛠️", "🎨", "📚", "💻", "🧪", "🎵", "✈️", "🍽️",
  "🧹", "💰", "🎁", "🦷", "❤️", "⚡", "🌿", "🔔",
  "🐛", "🔒", "📊", "🗣️", "🙌", "☕", "🌙", "☀️",
];

export function EmojiPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (emoji: string | null) => void;
}) {
  return (
    <div style={{ display: "grid", gap: "0.4rem" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "0.5rem",
        }}
      >
        <div style={{ fontSize: "0.85rem" }}>Icon</div>
        {value && (
          <button type="button" className="btn ghost compact" onClick={() => onChange(null)}>
            Clear
          </button>
        )}
      </div>
      <div className="emoji-picker-grid">
        {PICKS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className="emoji-pick"
            data-active={value === emoji ? "true" : "false"}
            onClick={() => onChange(value === emoji ? null : emoji)}
            title={emoji}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
