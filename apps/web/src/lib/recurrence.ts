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

function stepCursor(task: RecurrenceInput, cursor: Date): Date | null {
  if (!task.recurFreq) return null;
  const next = nextOccurrenceDate(
    cursor,
    task.recurFreq,
    task.recurInterval ?? 1,
    task.recurByWeekdays
  );
  if (next.getTime() <= cursor.getTime()) return null;
  return next;
}

/** All locked windows for an event (including repeats) that overlap [rangeStart, rangeEnd). */
export function expandLockedOccurrences(
  task: RecurrenceInput,
  rangeStart: Date,
  rangeEnd: Date
): { start: Date; end: Date }[] {
  if (!task.scheduledStart || !task.scheduledEnd) return [];
  const duration = task.scheduledEnd.getTime() - task.scheduledStart.getTime();
  if (duration <= 0) return [];

  const inRange = (start: Date) => {
    const end = new Date(start.getTime() + duration);
    return end > rangeStart && start < rangeEnd ? { start, end } : null;
  };

  if (!task.isRecurring || !task.recurFreq) {
    const hit = inRange(task.scheduledStart);
    return hit ? [hit] : [];
  }

  const out: { start: Date; end: Date }[] = [];
  const maxCount = Math.min(task.recurCount ?? 400, 400);
  let cursor = new Date(task.scheduledStart);
  let seriesIndex = 0;

  while (seriesIndex < maxCount && cursor < rangeEnd) {
    if (task.recurEndsAt && cursor > task.recurEndsAt) break;
    const end = new Date(cursor.getTime() + duration);
    if (end <= rangeStart) {
      const next = stepCursor(task, cursor);
      if (!next) break;
      cursor = next;
      seriesIndex += 1;
      continue;
    }
    const hit = inRange(cursor);
    if (hit) out.push(hit);
    seriesIndex += 1;
    const next = stepCursor(task, cursor);
    if (!next) break;
    cursor = next;
  }
  return out;
}

export function describeRecurrence(task: RecurrenceInput): string | null {
  if (!task.isRecurring || !task.recurFreq) return null;
  const n = Math.max(1, task.recurInterval ?? 1);
  if (task.recurFreq === "DAILY") return n === 1 ? "Repeats daily" : `Repeats every ${n} days`;
  if (task.recurFreq === "MONTHLY") return n === 1 ? "Repeats monthly" : `Repeats every ${n} months`;
  return n === 1 ? "Repeats weekly" : `Repeats every ${n} weeks`;
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
