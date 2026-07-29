import { addDays, addMonths, addWeeks } from "date-fns";

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

export function nextOccurrenceDate(from: Date, freq: string, interval: number) {
  if (freq === "DAILY") return addDays(from, interval);
  if (freq === "MONTHLY") return addMonths(from, interval);
  return addWeeks(from, interval);
}

function recurrenceBase(task: RecurrenceInput): Date {
  return task.dueAt ?? task.scheduledStart ?? new Date();
}

export function shouldCreateNextOccurrence(task: RecurrenceInput) {
  if (!task.isRecurring || !task.recurFreq) return false;
  const done = (task.recurOccurrencesDone ?? 0) + 1;
  if (task.recurCount != null && done >= task.recurCount) return false;
  const base = recurrenceBase(task);
  const nextDue = nextOccurrenceDate(base, task.recurFreq, task.recurInterval ?? 1);
  if (task.recurEndsAt && nextDue > task.recurEndsAt) return false;
  return true;
}

export function buildNextOccurrenceFields(task: RecurrenceInput & { id: string }) {
  const base = recurrenceBase(task);
  const nextAnchor = nextOccurrenceDate(base, task.recurFreq!, task.recurInterval ?? 1);
  const deltaMs = nextAnchor.getTime() - base.getTime();

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
