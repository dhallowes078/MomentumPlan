/** Shared day-hours helpers for prefs / buckets / scheduler. */

export type DayHoursValue = {
  startMinutes: number;
  endMinutes: number;
  breakStartMinutes?: number | null;
  breakEndMinutes?: number | null;
};

/** Map keyed by weekday 0–6 (or string "0"–"6" from JSON). */
export type DayHoursMap = Partial<Record<number, DayHoursValue>>;

export function parseDayHours(raw: unknown): DayHoursMap | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: DayHoursMap = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const dow = Number(key);
    if (!Number.isInteger(dow) || dow < 0 || dow > 6) continue;
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const v = value as Record<string, unknown>;
    if (typeof v.startMinutes !== "number" || typeof v.endMinutes !== "number") continue;
    out[dow] = {
      startMinutes: v.startMinutes,
      endMinutes: v.endMinutes,
      breakStartMinutes:
        v.breakStartMinutes === null || typeof v.breakStartMinutes === "number"
          ? (v.breakStartMinutes as number | null)
          : undefined,
      breakEndMinutes:
        v.breakEndMinutes === null || typeof v.breakEndMinutes === "number"
          ? (v.breakEndMinutes as number | null)
          : undefined,
    };
  }
  return Object.keys(out).length ? out : null;
}

/** Serialize for JSON columns / API (string keys). */
export function serializeDayHours(map: DayHoursMap | null | undefined): Record<string, DayHoursValue> | null {
  if (!map) return null;
  const out: Record<string, DayHoursValue> = {};
  for (const [dow, hours] of Object.entries(map)) {
    if (!hours) continue;
    out[String(dow)] = hours;
  }
  return Object.keys(out).length ? out : null;
}
