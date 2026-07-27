export const THEME_PRESETS = [
  { id: "forest", label: "Forest", color: "#1f4d3a" },
  { id: "ocean", label: "Ocean", color: "#1e4d6b" },
  { id: "slate", label: "Slate", color: "#334155" },
  { id: "wine", label: "Wine", color: "#7a2e3a" },
  { id: "umber", label: "Umber", color: "#6b4a2f" },
  { id: "teal", label: "Teal", color: "#0f766e" },
] as const;

export const THEME_STORAGE_KEY = "momentum_theme";

export type StoredTheme = {
  themeColor: string;
  darkMode: boolean;
};

export function shade(hex: string, amount: number) {
  const raw = hex.replace("#", "");
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  const num = Number.parseInt(full, 16);
  const r = Math.min(255, Math.max(0, ((num >> 16) & 255) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 255) + amount));
  const b = Math.min(255, Math.max(0, (num & 255) + amount));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export function readStoredTheme(): StoredTheme | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredTheme>;
    if (!parsed.themeColor || typeof parsed.darkMode !== "boolean") return null;
    return { themeColor: parsed.themeColor, darkMode: parsed.darkMode };
  } catch {
    return null;
  }
}

export function writeStoredTheme(themeColor: string, darkMode: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      THEME_STORAGE_KEY,
      JSON.stringify({ themeColor, darkMode } satisfies StoredTheme)
    );
  } catch {
    // ignore quota / private mode
  }
}

export function applyTheme(themeColor: string, darkMode: boolean, persist = true) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.theme = darkMode ? "dark" : "light";
  root.style.setProperty("--brand", themeColor);
  root.style.setProperty("--brand-hot", shade(themeColor, 28));
  root.style.setProperty("--ok", shade(themeColor, 24));
  if (persist) writeStoredTheme(themeColor, darkMode);
}
