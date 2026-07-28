"use client";

import { useRef, useState } from "react";
import { Keyboard } from "lucide-react";

const PICKS = [
  "🎯", "🚀", "💡", "📝", "✅", "🔥", "⭐", "📌",
  "💼", "🏠", "🛒", "📞", "✉️", "📅", "🏃", "🧠",
  "🛠️", "🎨", "📚", "💻", "🧪", "🎵", "✈️", "🍽️",
  "🧹", "💰", "🎁", "🦷", "❤️", "⚡", "🌿", "🔔",
  "🐛", "🔒", "📊", "🗣️", "🙌", "☕", "🌙", "☀️",
];

function lastGrapheme(value: string) {
  const chars = [...value.trim()];
  return chars.length ? chars[chars.length - 1] : null;
}

export function EmojiPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (emoji: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);

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
        <div style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
          <button
            type="button"
            className="btn ghost compact"
            title="Open system emoji keyboard"
            onClick={() => {
              const el = inputRef.current;
              if (!el) return;
              el.focus();
              try {
                el.setSelectionRange(el.value.length, el.value.length);
              } catch {
                /* ignore */
              }
            }}
          >
            <Keyboard size={14} /> Keyboard
          </button>
          {value && (
            <button type="button" className="btn ghost compact" onClick={() => onChange(null)}>
              Clear
            </button>
          )}
        </div>
      </div>

      <label
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: "0.5rem",
          alignItems: "center",
          fontSize: "0.85rem",
        }}
      >
        <button
          type="button"
          aria-label="Quick emoji picks"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          style={{
            width: 36,
            height: 36,
            display: "grid",
            placeItems: "center",
            borderRadius: 10,
            border: "1px solid var(--line)",
            background: "var(--field-bg)",
            fontSize: "1.25rem",
            cursor: "pointer",
            padding: 0,
          }}
        >
          {value || "🙂"}
        </button>
        <input
          ref={inputRef}
          className="field"
          inputMode="text"
          enterKeyHint="done"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Tap Keyboard, then pick an emoji"
          value={value ?? ""}
          onChange={(e) => {
            const next = lastGrapheme(e.target.value);
            onChange(next);
          }}
          onFocus={(e) => {
            e.currentTarget.select();
          }}
        />
      </label>

      {open && (
        <div className="emoji-picker-grid" aria-label="Quick emoji picks">
          {PICKS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="emoji-pick"
              data-active={value === emoji ? "true" : "false"}
              onClick={() => {
                onChange(value === emoji ? null : emoji);
                setOpen(false);
              }}
              title={emoji}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
