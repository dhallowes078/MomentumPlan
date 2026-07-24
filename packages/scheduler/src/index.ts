export type BusyBlock = {
  start: Date;
  end: Date;
};

export type SchedulableTask = {
  id: string;
  priority: number;
  estimateMinutes: number;
  dueAt: Date | null;
  locked: boolean;
  lockedStart?: Date | null;
  lockedEnd?: Date | null;
  allowSplit?: boolean;
  createdAt: Date;
};

export type WorkHours = {
  /** 0 = Sunday … 6 = Saturday */
  days: number[];
  startMinutes: number;
  endMinutes: number;
  /** Optional lunch break within work day */
  breakStartMinutes?: number | null;
  breakEndMinutes?: number | null;
  timezone?: string;
};

export type SchedulerPrefs = {
  workHours: WorkHours;
  planningDays: number;
  minChunkMinutes: number;
  bufferMinutes: number;
};

export type Placement = {
  taskId: string;
  start: Date;
  end: Date;
  atRisk: boolean;
};

export type ScheduleResult = {
  placements: Placement[];
  unplaced: Array<{ taskId: string; reason: string; atRisk: boolean }>;
};

const MS_PER_MIN = 60_000;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function minutesSinceMidnight(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

function atMinutes(day: Date, minutes: number): Date {
  const x = startOfDay(day);
  x.setMinutes(minutes);
  return x;
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function mergeBusy(blocks: BusyBlock[]): BusyBlock[] {
  if (blocks.length === 0) return [];
  const sorted = [...blocks].sort((a, b) => a.start.getTime() - b.start.getTime());
  const out: BusyBlock[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    const last = out[out.length - 1];
    if (cur.start <= last.end) {
      if (cur.end > last.end) last.end = cur.end;
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

/** Build free intervals inside work hours, excluding busy blocks. */
export function freeSlots(
  from: Date,
  to: Date,
  busy: BusyBlock[],
  prefs: SchedulerPrefs
): BusyBlock[] {
  const { workHours, bufferMinutes } = prefs;
  const bufferedBusy = mergeBusy(
    busy.map((b) => ({
      start: new Date(b.start.getTime() - bufferMinutes * MS_PER_MIN),
      end: new Date(b.end.getTime() + bufferMinutes * MS_PER_MIN),
    }))
  );

  const free: BusyBlock[] = [];
  let day = startOfDay(from);
  const endDay = startOfDay(to);

  while (day <= endDay) {
    const dow = day.getDay();
    if (workHours.days.includes(dow)) {
      const dayStart = atMinutes(day, workHours.startMinutes);
      const dayEnd = atMinutes(day, workHours.endMinutes);
      const windows: BusyBlock[] = [];

      if (
        workHours.breakStartMinutes != null &&
        workHours.breakEndMinutes != null &&
        workHours.breakStartMinutes < workHours.breakEndMinutes
      ) {
        windows.push({
          start: dayStart,
          end: atMinutes(day, workHours.breakStartMinutes),
        });
        windows.push({
          start: atMinutes(day, workHours.breakEndMinutes),
          end: dayEnd,
        });
      } else {
        windows.push({ start: dayStart, end: dayEnd });
      }

      for (const win of windows) {
        const winStart = win.start < from ? from : win.start;
        const winEnd = win.end > to ? to : win.end;
        if (winStart >= winEnd) continue;

        const dayBusy = bufferedBusy
          .filter((b) => overlaps(b.start, b.end, winStart, winEnd))
          .map((b) => ({
            start: b.start < winStart ? winStart : b.start,
            end: b.end > winEnd ? winEnd : b.end,
          }))
          .sort((a, b) => a.start.getTime() - b.start.getTime());

        let cursor = winStart;
        for (const b of dayBusy) {
          if (b.start > cursor) {
            free.push({ start: cursor, end: b.start });
          }
          if (b.end > cursor) cursor = b.end;
        }
        if (cursor < winEnd) {
          free.push({ start: cursor, end: winEnd });
        }
      }
    }
    day = addDays(day, 1);
  }

  return free.filter((s) => s.end.getTime() - s.start.getTime() >= prefs.minChunkMinutes * MS_PER_MIN);
}

function sortTasks(tasks: SchedulableTask[]): SchedulableTask[] {
  return [...tasks].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    const aDue = a.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
    const bDue = b.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
    if (aDue !== bDue) return aDue - bDue;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

function takeFromSlots(
  slots: BusyBlock[],
  neededMinutes: number,
  minChunk: number,
  allowSplit: boolean
): { placements: BusyBlock[]; remainingSlots: BusyBlock[] } | null {
  const neededMs = neededMinutes * MS_PER_MIN;
  const minMs = minChunk * MS_PER_MIN;
  const remaining = slots.map((s) => ({ ...s }));

  if (!allowSplit) {
    for (let i = 0; i < remaining.length; i++) {
      const s = remaining[i];
      const dur = s.end.getTime() - s.start.getTime();
      if (dur >= neededMs) {
        const start = s.start;
        const end = new Date(start.getTime() + neededMs);
        const next = [...remaining];
        if (end.getTime() < s.end.getTime()) {
          next[i] = { start: end, end: s.end };
        } else {
          next.splice(i, 1);
        }
        return { placements: [{ start, end }], remainingSlots: next };
      }
    }
    return null;
  }

  // Split across slots
  let left = neededMs;
  const placements: BusyBlock[] = [];
  const next: BusyBlock[] = [];

  for (const s of remaining) {
    if (left <= 0) {
      next.push(s);
      continue;
    }
    const dur = s.end.getTime() - s.start.getTime();
    if (dur < minMs && left > dur) {
      next.push(s);
      continue;
    }
    const take = Math.min(dur, left);
    if (take < minMs && take < left) {
      next.push(s);
      continue;
    }
    const start = s.start;
    const end = new Date(start.getTime() + take);
    placements.push({ start, end });
    left -= take;
    if (end.getTime() < s.end.getTime()) {
      next.push({ start: end, end: s.end });
    }
  }

  if (left > 0) return null;
  return { placements, remainingSlots: next };
}

/**
 * Greedy Motion-style packer: priority → due date → created,
 * earliest free slots within work hours.
 */
export function packSchedule(
  tasks: SchedulableTask[],
  busy: BusyBlock[],
  now: Date,
  prefs: SchedulerPrefs
): ScheduleResult {
  const planningEnd = addDays(now, prefs.planningDays);
  let slots = freeSlots(now, planningEnd, busy, prefs);

  const placements: Placement[] = [];
  const unplaced: ScheduleResult["unplaced"] = [];

  // Locked tasks occupy their windows and are reported as placements
  const lockedBusy: BusyBlock[] = [];
  for (const t of tasks) {
    if (t.locked && t.lockedStart && t.lockedEnd) {
      placements.push({
        taskId: t.id,
        start: t.lockedStart,
        end: t.lockedEnd,
        atRisk: t.dueAt ? t.lockedEnd > t.dueAt : false,
      });
      lockedBusy.push({ start: t.lockedStart, end: t.lockedEnd });
    }
  }
  if (lockedBusy.length) {
    slots = freeSlots(now, planningEnd, [...busy, ...lockedBusy], prefs);
  }

  const candidates = sortTasks(
    tasks.filter((t) => !t.locked && t.estimateMinutes > 0)
  );

  for (const task of candidates) {
    const allowSplit = task.allowSplit ?? true;
    const taken = takeFromSlots(
      slots,
      task.estimateMinutes,
      prefs.minChunkMinutes,
      allowSplit
    );

    if (!taken) {
      const atRisk = task.dueAt ? task.dueAt < planningEnd : true;
      unplaced.push({
        taskId: task.id,
        reason: "no_slot",
        atRisk,
      });
      continue;
    }

    slots = taken.remainingSlots;
    // Use first contiguous placement as primary; additional chunks as extra placements
    for (const p of taken.placements) {
      const atRisk = Boolean(task.dueAt && p.end > task.dueAt);
      placements.push({
        taskId: task.id,
        start: p.start,
        end: p.end,
        atRisk,
      });
    }
  }

  return { placements, unplaced };
}

export const DEFAULT_PREFS: SchedulerPrefs = {
  workHours: {
    days: [1, 2, 3, 4, 5],
    startMinutes: 9 * 60,
    endMinutes: 17 * 60,
    breakStartMinutes: 12 * 60,
    breakEndMinutes: 13 * 60,
  },
  planningDays: 14,
  minChunkMinutes: 25,
  bufferMinutes: 5,
};
