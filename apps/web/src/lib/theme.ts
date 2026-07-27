export const THEME_PRESETS = [
  { id: "forest", label: "Forest", color: "#1f4d3a" },
  { id: "ocean", label: "Ocean", color: "#1e4d6b" },
  { id: "slate", label: "Slate", color: "#334155" },
  { id: "wine", label: "Wine", color: "#7a2e3a" },
  { id: "umber", label: "Umber", color: "#6b4a2f" },
  { id: "teal", label: "Teal", color: "#0f766e" },
] as const;

export const THEME_STORAGE_KEY = "momentum_theme";
export const CALENDAR_VIEW_KEY = "momentum_calendar_view";

export type StoredTheme = {
  themeColor: string;
  darkMode: boolean;
};

export type CalendarViewMode = "horizontal" | "vertical";

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

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function hexToRgb(hex: string): [number, number, number] {
  const raw = hex.replace("#", "");
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw.padEnd(6, "0").slice(0, 6);
  const num = Number.parseInt(full, 16);
  if (Number.isNaN(num)) return [31, 77, 58];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return [h * 360, s, l];
}

function hslToHex(h: number, s: number, l: number) {
  const hh = ((h % 360) + 360) % 360;
  const ss = clamp(s, 0, 1);
  const ll = clamp(l, 0, 1);
  const c = (1 - Math.abs(2 * ll - 1)) * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = ll - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hh < 60) [r, g, b] = [c, x, 0];
  else if (hh < 120) [r, g, b] = [x, c, 0];
  else if (hh < 180) [r, g, b] = [0, c, x];
  else if (hh < 240) [r, g, b] = [0, x, c];
  else if (hh < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** Build surface/ink/accent tokens from a brand hue so the whole UI shifts. */
export function buildThemePalette(themeColor: string, darkMode: boolean) {
  const [h, s] = rgbToHsl(...hexToRgb(themeColor));
  const sat = clamp(s, 0.18, 0.55);
  const accentH = (h + 34) % 360;

  if (darkMode) {
    const bg = hslToHex(h, sat * 0.55, 0.08);
    const bgElevated = hslToHex(h, sat * 0.5, 0.13);
    const ink = hslToHex(h, sat * 0.25, 0.92);
    const inkMuted = hslToHex(h, sat * 0.28, 0.68);
    return {
      brand: themeColor,
      brandHot: shade(themeColor, 28),
      ok: shade(themeColor, 24),
      bg,
      bgElevated,
      ink,
      inkMuted,
      accent: hslToHex(accentH, 0.62, 0.58),
      line: `hsla(${Math.round(h)}, 18%, 88%, 0.12)`,
      danger: hslToHex(8, 0.62, 0.62),
      warn: hslToHex(42, 0.65, 0.58),
      shadow: `0 18px 50px hsla(${Math.round(h)}, 40%, 4%, 0.45)`,
      fieldBg: `hsla(${Math.round(h)}, 30%, 6%, 0.5)`,
      cardBg: `color-mix(in srgb, ${bgElevated} 88%, black)`,
    };
  }

  const bg = hslToHex(h, sat * 0.45, 0.93);
  const bgElevated = hslToHex(h, sat * 0.35, 0.97);
  const ink = hslToHex(h, clamp(sat * 0.75, 0.2, 0.45), 0.14);
  const inkMuted = hslToHex(h, sat * 0.4, 0.36);
  return {
    brand: themeColor,
    brandHot: shade(themeColor, 28),
    ok: shade(themeColor, 24),
    bg,
    bgElevated,
    ink,
    inkMuted,
    accent: hslToHex(accentH, 0.68, 0.46),
    line: `hsla(${Math.round(h)}, 22%, 18%, 0.12)`,
    danger: hslToHex(8, 0.55, 0.42),
    warn: hslToHex(38, 0.58, 0.42),
    shadow: `0 18px 50px hsla(${Math.round(h)}, 30%, 12%, 0.1)`,
    fieldBg: `hsla(${Math.round(h)}, 40%, 99%, 0.72)`,
    cardBg: `color-mix(in srgb, ${bgElevated} 92%, white)`,
  };
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

export function readCalendarView(): CalendarViewMode {
  if (typeof window === "undefined") return "horizontal";
  try {
    const v = window.localStorage.getItem(CALENDAR_VIEW_KEY);
    return v === "vertical" ? "vertical" : "horizontal";
  } catch {
    return "horizontal";
  }
}

export function writeCalendarView(view: CalendarViewMode) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CALENDAR_VIEW_KEY, view);
  } catch {
    // ignore
  }
}

export function applyTheme(themeColor: string, darkMode: boolean, persist = true) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const p = buildThemePalette(themeColor, darkMode);
  root.dataset.theme = darkMode ? "dark" : "light";
  root.style.setProperty("--brand", p.brand);
  root.style.setProperty("--brand-hot", p.brandHot);
  root.style.setProperty("--ok", p.ok);
  root.style.setProperty("--bg", p.bg);
  root.style.setProperty("--bg-elevated", p.bgElevated);
  root.style.setProperty("--ink", p.ink);
  root.style.setProperty("--ink-muted", p.inkMuted);
  root.style.setProperty("--accent", p.accent);
  root.style.setProperty("--line", p.line);
  root.style.setProperty("--danger", p.danger);
  root.style.setProperty("--warn", p.warn);
  root.style.setProperty("--shadow", p.shadow);
  root.style.setProperty("--field-bg", p.fieldBg);
  root.style.setProperty("--card-bg", p.cardBg);
  if (persist) writeStoredTheme(themeColor, darkMode);
}
