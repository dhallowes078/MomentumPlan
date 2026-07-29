import { addDays, addMonths, addWeeks, startOfDay } from "date-fns";

export type RecurrenceInput = {
  isRecurring: boolean;
  recurFreq?: string | null;
  recurInterval?: number | null;
  recurByWeekdays?: number[] | null;
  recurEndsAt?: Date | null;
  recurCount?: number | null;
  recurOccurrencesDone?: number | null;
  dueAt?: Date | null;
  /** For locked events — used as the recurrence anchor when dueAt is null. */
  scheduledStart?: Date | null;
  scheduledEnd?: Date | null;
  locked?: boolean;
};

function normalizeWeekdays(raw?: number[] | null): number[] {
  if (!raw?.length) return [];
  return [...new Set(raw.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort(
    (a, b) => a - b
  );
}

/** Next weekly occurrence, optionally limited to selected weekdays (0=Sun…6=Sat). */
export function nextWeeklyOccurrence(
  from: Date,
  interval: number,
  byWeekdays?: number[] | null
): Date {
  const days = normalizeWeekdays(byWeekdays);
  const step = Math.max(1, interval);
  if (!days.length) return addWeeks(from, step);

  const fromDow = from.getDay();
  // Later this week on a selected weekday.
  for (const d of days) {
    if (d > fromDow) return addDays(from, d - fromDow);
  }
  // First selected weekday in the week `step` weeks ahead.
  const daysUntilFirstNextCycle = 7 - fromDow + days[0] + (step - 1) * 7;
  return addDays(from, daysUntilFirstNextCycle);
}

export function nextOccurrenceDate(
  from: Date,
  freq: string,
  interval: number,
  byWeekdays?: number[] | null
) {
  const step = Math.max(1, interval);
  if (freq === "DAILY") return addDays(from, step);
  if (freq === "MONTHLY") return addMonths(from, step);
  return nextWeeklyOccurrence(from, step, byWeekdays);
}

function recurrenceBase(task: RecurrenceInput): Date {
  const raw = task.dueAt ?? task.scheduledStart ?? new Date();
  return startOfDay(raw);
}

export function shouldCreateNextOccurrence(task: RecurrenceInput) {
  if (!task.isRecurring || !task.recurFreq) return false;
  const done = (task.recurOccurrencesDone ?? 0) + 1;
  if (task.recurCount != null && done >= task.recurCount) return false;
  const base = recurrenceBase(task);
  const nextDue = nextOccurrenceDate(
    base,
    task.recurFreq,
    task.recurInterval ?? 1,
    task.recurByWeekdays
  );
  if (task.recurEndsAt && nextDue > task.recurEndsAt) return false;
  return true;
}

export function buildNextOccurrenceFields(task: RecurrenceInput & { id: string }) {
  const base = recurrenceBase(task);
  const nextAnchor = nextOccurrenceDate(
    base,
    task.recurFreq!,
    task.recurInterval ?? 1,
    task.recurByWeekdays
  );
  // Preserve time-of-day from the original due/scheduled timestamp.
  const original = task.dueAt ?? task.scheduledStart ?? new Date();
  nextAnchor.setHours(
    original.getHours(),
    original.getMinutes(),
    original.getSeconds(),
    original.getMilliseconds()
  );
  const deltaMs = nextAnchor.getTime() - (task.dueAt ?? task.scheduledStart ?? base).getTime();

  let scheduledStart: Date | null = null;
  let scheduledEnd: Date | null = null;
  if (task.scheduledStart && task.scheduledEnd) {
    scheduledStart = new Date(task.scheduledStart.getTime() + deltaMs);
    scheduledEnd = new Date(task.scheduledEnd.getTime() + deltaMs);
  }

  return {
    dueAt: task.dueAt ? nextAnchor : null,
    scheduledStart,
    scheduledEnd,
    locked: Boolean(task.locked && scheduledStart && scheduledEnd),
    allowSplit: task.locked ? false : undefined,
    recurOccurrencesDone: (task.recurOccurrencesDone ?? 0) + 1,
    recurParentId: task.id,
  };
}
