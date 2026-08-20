import { v4 as uuid } from "uuid";
import { addDays, startOfDay } from "date-fns";
import {
  packSchedule,
  type BusyBlock,
  type SchedulerPrefs,
  type SchedulableTask,
} from "@momentum/scheduler";
import { localDb, type LocalScheduleBlock } from "./db";
import * as repo from "./repo";
import { parseDayHours } from "@/lib/day-hours";
import { expandLockedOccurrences } from "@/lib/recurrence";

/** Pack open tasks into Dexie schedule blocks on-device (no server required). */
export async function runLocalScheduler() {
  const prefsRow = await repo.getPrefs();
  const prefs: SchedulerPrefs = {
    workHours: {
      days: prefsRow.workDays?.length ? prefsRow.workDays : [1, 2, 3, 4, 5],
      startMinutes: prefsRow.startMinutes ?? 540,
      endMinutes: prefsRow.endMinutes ?? 1020,
      breakStartMinutes: prefsRow.breakStartMinutes,
      breakEndMinutes: prefsRow.breakEndMinutes,
      dayHours: prefsRow.dayHours ?? null,
      timezone: prefsRow.timezone,
    },
    planningDays: prefsRow.planningDays ?? 14,
    minChunkMinutes: prefsRow.minChunkMinutes ?? 25,
    bufferMinutes: prefsRow.bufferMinutes ?? 5,
  };

  const tasks = await localDb.tasks
    .filter((t) => t.status === "TODO" || t.status === "IN_PROGRESS")
    .toArray();

  const workspaces = await localDb.workspaces.toArray();
  const bucketById = new Map(
    workspaces.flatMap((w) => (w.buckets ?? []).map((b) => [b.id, b] as const))
  );

  const schedulable: SchedulableTask[] = tasks.map((t) => {
    const bucket =
      t.bucket ?? (t.bucketId ? bucketById.get(t.bucketId) ?? null : null);
    const bucketDayHours = parseDayHours(bucket?.dayHours);
    const hasBucketHours =
      bucket &&
      (bucket.startMinutes != null ||
        bucket.endMinutes != null ||
        (Array.isArray(bucket.workDays) && bucket.workDays.length > 0) ||
        bucket.breakStartMinutes != null ||
        bucket.breakEndMinutes != null ||
        bucketDayHours != null);
    return {
      id: t.id,
      priority: t.priority,
      estimateMinutes: t.estimateMinutes,
      dueAt: t.dueAt ? new Date(t.dueAt) : null,
      locked: Boolean(t.locked),
      lockedStart: t.locked && t.scheduledStart ? new Date(t.scheduledStart) : null,
      lockedEnd: t.locked && t.scheduledEnd ? new Date(t.scheduledEnd) : null,
      allowSplit: t.allowSplit !== false,
      position: t.position,
      createdAt: new Date(t.updatedAt || Date.now()),
      workHours: hasBucketHours
        ? {
            days:
              Array.isArray(bucket.workDays) && bucket.workDays.length
                ? bucket.workDays
                : prefs.workHours.days,
            startMinutes: bucket.startMinutes ?? prefs.workHours.startMinutes,
            endMinutes: bucket.endMinutes ?? prefs.workHours.endMinutes,
            breakStartMinutes:
              bucket.breakStartMinutes !== undefined
                ? bucket.breakStartMinutes
                : prefs.workHours.breakStartMinutes,
            breakEndMinutes:
              bucket.breakEndMinutes !== undefined
                ? bucket.breakEndMinutes
                : prefs.workHours.breakEndMinutes,
            dayHours: bucketDayHours ?? prefs.workHours.dayHours ?? null,
          }
        : null,
    };
  });

  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const expanded: SchedulableTask[] = [];
  const rangeStart = startOfDay(new Date());
  const rangeEnd = addDays(rangeStart, Math.max(prefs.planningDays, 14) + 1);
  for (const t of schedulable) {
    const src = taskById.get(t.id);
    if (t.locked && t.lockedStart && t.lockedEnd && src?.isRecurring) {
      const windows = expandLockedOccurrences(
        {
          isRecurring: true,
          recurFreq: src.recurFreq,
          recurInterval: src.recurInterval,
          recurByWeekdays: src.recurByWeekdays,
          recurEndsAt: src.recurEndsAt ? new Date(src.recurEndsAt) : null,
          recurCount: src.recurCount,
          scheduledStart: t.lockedStart,
          scheduledEnd: t.lockedEnd,
          locked: true,
        },
        rangeStart,
        rangeEnd
      );
      if (windows.length) {
        for (const w of windows) {
          expanded.push({ ...t, lockedStart: w.start, lockedEnd: w.end });
        }
        continue;
      }
    }
    expanded.push(t);
  }

  const meetings = await localDb.meetings.toArray();
  const busy: BusyBlock[] = meetings
    .filter((m) => !m.isMomentum)
    .map((m) => ({ start: new Date(m.start), end: new Date(m.end) }));

  const result = packSchedule(expanded, busy, new Date(), prefs);

  const blocks: LocalScheduleBlock[] = result.placements.map((p) => {
    const task = taskById.get(p.taskId);
    const bucket =
      task?.bucket ??
      (task?.bucketId ? bucketById.get(task.bucketId) ?? null : null) ??
      null;
    return {
      id: `local_block_${uuid()}`,
      taskId: p.taskId,
      start: p.start.toISOString(),
      end: p.end.toISOString(),
      completed: false,
      task: task
        ? {
            id: task.id,
            title: task.title,
            priority: task.priority,
            atRisk: p.atRisk,
            estimateMinutes: task.estimateMinutes,
            status: task.status,
            emoji: task.emoji,
            headerImageUrl: task.headerImageUrl,
            bucket,
          }
        : undefined,
    };
  });

  await repo.replaceSchedule(blocks);

  const firstByTask = new Map<string, (typeof result.placements)[number]>();
  const lastByTask = new Map<string, (typeof result.placements)[number]>();
  for (const p of result.placements) {
    if (!firstByTask.has(p.taskId)) firstByTask.set(p.taskId, p);
    lastByTask.set(p.taskId, p);
  }
  const unplacedRisk = new Set(result.unplaced.filter((u) => u.atRisk).map((u) => u.taskId));

  await localDb.transaction("rw", localDb.tasks, async () => {
    for (const t of tasks) {
      const first = firstByTask.get(t.id);
      const last = lastByTask.get(t.id);
      if (t.locked) {
        await localDb.tasks.update(t.id, {
          atRisk: first ? first.atRisk : unplacedRisk.has(t.id),
          updatedAt: new Date().toISOString(),
        });
        continue;
      }
      await localDb.tasks.update(t.id, {
        scheduledStart: first ? first.start.toISOString() : null,
        scheduledEnd: last ? last.end.toISOString() : null,
        atRisk: first ? first.atRisk : unplacedRisk.has(t.id),
        updatedAt: new Date().toISOString(),
      });
    }
  });

  try {
    const { rescheduleTaskNotifications } = await import("./notifications");
    await rescheduleTaskNotifications();
  } catch {
    /* optional */
  }

  return { placed: result.placements.length, unplaced: result.unplaced.length };
}
