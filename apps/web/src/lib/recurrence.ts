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
};

export function nextOccurrenceDate(from: Date, freq: string, interval: number) {
  if (freq === "DAILY") return addDays(from, interval);
  if (freq === "MONTHLY") return addMonths(from, interval);
  return addWeeks(from, interval);
}

export function shouldCreateNextOccurrence(task: RecurrenceInput) {
  if (!task.isRecurring || !task.recurFreq) return false;
  const done = (task.recurOccurrencesDone ?? 0) + 1;
  if (task.recurCount != null && done >= task.recurCount) return false;
  const base = task.dueAt ?? new Date();
  const nextDue = nextOccurrenceDate(base, task.recurFreq, task.recurInterval ?? 1);
  if (task.recurEndsAt && nextDue > task.recurEndsAt) return false;
  return true;
}

export function buildNextOccurrenceFields(task: RecurrenceInput & { id: string }) {
  const base = task.dueAt ?? new Date();
  const nextDue = nextOccurrenceDate(base, task.recurFreq!, task.recurInterval ?? 1);
  return {
    dueAt: nextDue,
    recurOccurrencesDone: (task.recurOccurrencesDone ?? 0) + 1,
    recurParentId: task.id,
  };
}
