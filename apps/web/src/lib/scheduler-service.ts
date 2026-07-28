import {
  packSchedule,
  DEFAULT_PREFS,
  type BusyBlock,
  type SchedulerPrefs,
  type SchedulableTask,
} from "@momentum/scheduler";
import { prisma } from "@/lib/db";
import {
  deleteTaskEvent,
  isMomentumEvent,
  listCalendarEvents,
  upsertTaskEvent,
} from "@/lib/graph";
import { addDays } from "date-fns";

const MS_PER_MIN = 60_000;

async function loadPrefs(userId: string): Promise<SchedulerPrefs> {
  const row = await prisma.schedulePrefs.findUnique({ where: { userId } });
  if (!row) return DEFAULT_PREFS;
  const workDays = Array.isArray(row.workDays)
    ? (row.workDays as number[])
    : DEFAULT_PREFS.workHours.days;
  return {
    workHours: {
      days: workDays,
      startMinutes: row.startMinutes,
      endMinutes: row.endMinutes,
      breakStartMinutes: row.breakStartMinutes,
      breakEndMinutes: row.breakEndMinutes,
      timezone: row.timezone,
    },
    planningDays: row.planningDays,
    minChunkMinutes: row.minChunkMinutes,
    bufferMinutes: row.bufferMinutes,
  };
}

function sameInstant(a: Date, b: Date) {
  return Math.abs(a.getTime() - b.getTime()) < 1000;
}

export async function runSchedulerForUser(userId: string) {
  const prefs = await loadPrefs(userId);
  const now = new Date();
  const windowEnd = addDays(now, prefs.planningDays);

  const memberships = await prisma.workspaceMember.findMany({
    where: { userId },
    select: { workspaceId: true },
  });
  const workspaceIds = memberships.map((m) => m.workspaceId);

  await prisma.task.updateMany({
    where: {
      workspaceId: { in: workspaceIds },
      status: { in: ["TODO", "IN_PROGRESS"] },
      locked: true,
      scheduledEnd: { lt: now },
      OR: [{ assigneeId: userId }, { assigneeId: null, createdById: userId }],
    },
    data: { locked: false },
  });

  const tasks = await prisma.task.findMany({
    where: {
      workspaceId: { in: workspaceIds },
      status: { in: ["TODO", "IN_PROGRESS"] },
      OR: [{ assigneeId: userId }, { assigneeId: null, createdById: userId }],
    },
    include: {
      scheduleBlocks: true,
      bucket: true,
    },
  });

  let outlookBusy: BusyBlock[] = [];
  let hasGraph = false;
  const connection = await prisma.calendarConnection.findUnique({
    where: { userId },
    select: { accessToken: true, refreshToken: true },
  });
  if (connection?.accessToken || connection?.refreshToken) {
    hasGraph = true;
    try {
      const events = await listCalendarEvents(userId, now, windowEnd);
      outlookBusy = events
        .filter((e) => !isMomentumEvent(e) && e.showAs !== "free")
        .map((e) => ({
          start: new Date(e.start.dateTime.endsWith("Z") ? e.start.dateTime : e.start.dateTime + "Z"),
          end: new Date(e.end.dateTime.endsWith("Z") ? e.end.dateTime : e.end.dateTime + "Z"),
        }));
    } catch (e) {
      console.warn("Scheduler: Outlook unavailable, packing without calendar busy", e);
      hasGraph = false;
    }
  }

  // Completed chunks stay put and count as busy + done time.
  // In-progress chunks also stay put until their end time — the user may
  // still be working, so we only push after the timeslot is overrun.
  const completedBusy: BusyBlock[] = [];
  const stickyBusy: BusyBlock[] = [];
  const stickyBlockIds = new Set<string>();
  const completedMinutesByTask = new Map<string, number>();
  const stickyMinutesByTask = new Map<string, number>();

  for (const task of tasks) {
    let doneMin = 0;
    let stickyMin = 0;
    for (const block of task.scheduleBlocks) {
      if (block.completed) {
        completedBusy.push({ start: block.start, end: block.end });
        doneMin += Math.max(
          0,
          Math.round((block.end.getTime() - block.start.getTime()) / MS_PER_MIN)
        );
        continue;
      }
      if (block.start <= now && block.end > now) {
        stickyBusy.push({ start: block.start, end: block.end });
        stickyBlockIds.add(block.id);
        stickyMin += Math.max(
          0,
          Math.round((block.end.getTime() - block.start.getTime()) / MS_PER_MIN)
        );
      }
    }
    // Task-level window currently underway (no block row yet).
    if (
      stickyMin === 0 &&
      !task.locked &&
      task.scheduledStart &&
      task.scheduledEnd &&
      task.scheduledStart <= now &&
      task.scheduledEnd > now
    ) {
      stickyBusy.push({ start: task.scheduledStart, end: task.scheduledEnd });
      stickyMin += Math.max(
        0,
        Math.round(
          (task.scheduledEnd.getTime() - task.scheduledStart.getTime()) / MS_PER_MIN
        )
      );
    }
    completedMinutesByTask.set(task.id, doneMin);
    stickyMinutesByTask.set(task.id, stickyMin);
  }

  const schedulable: SchedulableTask[] = tasks
    .map((t) => {
      const reserved =
        (completedMinutesByTask.get(t.id) ?? 0) + (stickyMinutesByTask.get(t.id) ?? 0);
      const remaining = Math.max(0, t.estimateMinutes - reserved);
      const bucket = t.bucket;
      const bucketDays = Array.isArray(bucket?.workDays)
        ? (bucket!.workDays as number[])
        : null;
      const hasBucketHours =
        bucket &&
        (bucket.startMinutes != null ||
          bucket.endMinutes != null ||
          (bucketDays && bucketDays.length > 0) ||
          bucket.breakStartMinutes != null ||
          bucket.breakEndMinutes != null);
      return {
        id: t.id,
        priority: t.priority,
        estimateMinutes: remaining,
        dueAt: t.dueAt,
        locked: t.locked,
        lockedStart: t.locked ? t.scheduledStart : null,
        lockedEnd: t.locked ? t.scheduledEnd : null,
        allowSplit: t.allowSplit,
        position: t.position,
        createdAt: t.createdAt,
        workHours: hasBucketHours
          ? {
              days: bucketDays?.length ? bucketDays : prefs.workHours.days,
              startMinutes: bucket!.startMinutes ?? prefs.workHours.startMinutes,
              endMinutes: bucket!.endMinutes ?? prefs.workHours.endMinutes,
              breakStartMinutes:
                bucket!.breakStartMinutes !== undefined
                  ? bucket!.breakStartMinutes
                  : prefs.workHours.breakStartMinutes,
              breakEndMinutes:
                bucket!.breakEndMinutes !== undefined
                  ? bucket!.breakEndMinutes
                  : prefs.workHours.breakEndMinutes,
            }
          : null,
      };
    })
    .filter((t) => t.estimateMinutes > 0 || t.locked || (stickyMinutesByTask.get(t.id) ?? 0) > 0);

  const result = packSchedule(
    schedulable,
    [...outlookBusy, ...completedBusy, ...stickyBusy],
    now,
    prefs
  );

  const byTask = new Map<string, typeof result.placements>();
  for (const p of result.placements) {
    const list = byTask.get(p.taskId) ?? [];
    list.push(p);
    byTask.set(p.taskId, list);
  }

  const existingBlocks = await prisma.scheduleBlock.findMany({ where: { userId } });
  const usedBlockIds = new Set<string>();

  for (const task of tasks) {
    const completedBlocks = existingBlocks.filter(
      (b) => b.taskId === task.id && b.completed
    );
    const stickyBlocks = existingBlocks.filter(
      (b) => b.taskId === task.id && stickyBlockIds.has(b.id)
    );
    for (const b of completedBlocks) usedBlockIds.add(b.id);
    for (const b of stickyBlocks) usedBlockIds.add(b.id);

    const placements = byTask.get(task.id) ?? [];
    const atRisk =
      result.unplaced.some((u) => u.taskId === task.id && u.atRisk) ||
      placements.some((p) => p.atRisk);

    if (placements.length === 0 && completedBlocks.length === 0 && stickyBlocks.length === 0) {
      const changed =
        task.scheduledStart != null || task.scheduledEnd != null || task.atRisk !== atRisk;
      if (changed) {
        await prisma.task.update({
          where: { id: task.id },
          data: {
            scheduledStart: null,
            scheduledEnd: null,
            atRisk,
          },
        });
      }
      continue;
    }

    const starts = [
      ...stickyBlocks.map((b) => b.start),
      ...placements.map((p) => p.start),
      ...completedBlocks.map((b) => b.start),
    ];
    const ends = [
      ...stickyBlocks.map((b) => b.end),
      ...placements.map((p) => p.end),
      ...completedBlocks.map((b) => b.end),
    ];
    const windowStart =
      starts.length > 0
        ? new Date(Math.min(...starts.map((d) => d.getTime())))
        : null;
    const windowEndSlot =
      ends.length > 0 ? new Date(Math.max(...ends.map((d) => d.getTime()))) : null;

    if (windowStart && windowEndSlot) {
      const startSame =
        task.scheduledStart && sameInstant(task.scheduledStart, windowStart);
      const endSame = task.scheduledEnd && sameInstant(task.scheduledEnd, windowEndSlot);
      if (!startSame || !endSame || task.atRisk !== atRisk) {
        await prisma.task.update({
          where: { id: task.id },
          data: {
            scheduledStart: windowStart,
            scheduledEnd: windowEndSlot,
            ...(task.originalScheduledStart
              ? {}
              : {
                  originalScheduledStart: windowStart,
                  originalScheduledEnd: windowEndSlot,
                }),
            atRisk,
          },
        });
      } else if (!task.originalScheduledStart) {
        await prisma.task.update({
          where: { id: task.id },
          data: {
            originalScheduledStart: windowStart,
            originalScheduledEnd: windowEndSlot,
          },
        });
      }
    }

    // Only move incomplete blocks that are not the current in-progress slot.
    const openBlocks = existingBlocks.filter(
      (b) => b.taskId === task.id && !b.completed && !stickyBlockIds.has(b.id)
    );

    for (let i = 0; i < placements.length; i++) {
      const p = placements[i];
      let block = openBlocks[i];
      let outlookEventId = block?.outlookEventId ?? null;

      const unchanged =
        block &&
        sameInstant(block.start, p.start) &&
        sameInstant(block.end, p.end);

      if (hasGraph && !unchanged) {
        try {
          outlookEventId = await upsertTaskEvent(userId, {
            eventId: outlookEventId,
            title: task.title,
            start: p.start,
            end: p.end,
            body: task.notes ?? undefined,
          });
        } catch (e) {
          console.warn("Failed upserting Outlook event", e);
        }
      }

      if (block) {
        if (!unchanged) {
          block = await prisma.scheduleBlock.update({
            where: { id: block.id },
            data: {
              start: p.start,
              end: p.end,
              outlookEventId,
            },
          });
          await prisma.taskEvent.create({
            data: {
              taskId: task.id,
              actorId: userId,
              type: "RESCHEDULED",
              payload: {
                start: p.start.toISOString(),
                end: p.end.toISOString(),
                atRisk: p.atRisk,
              },
            },
          });
        }
      } else {
        block = await prisma.scheduleBlock.create({
          data: {
            taskId: task.id,
            userId,
            start: p.start,
            end: p.end,
            outlookEventId,
          },
        });
        await prisma.taskEvent.create({
          data: {
            taskId: task.id,
            actorId: userId,
            type: "SCHEDULED",
            payload: {
              start: p.start.toISOString(),
              end: p.end.toISOString(),
              atRisk: p.atRisk,
            },
          },
        });
      }
      usedBlockIds.add(block.id);
    }

    for (let i = placements.length; i < openBlocks.length; i++) {
      const extra = openBlocks[i];
      if (hasGraph && extra.outlookEventId) {
        await deleteTaskEvent(userId, extra.outlookEventId);
      }
      await prisma.scheduleBlock.delete({ where: { id: extra.id } });
    }
  }

  for (const block of existingBlocks) {
    if (usedBlockIds.has(block.id)) continue;
    if (block.completed) continue;
    const stillNeeded = byTask.has(block.taskId);
    if (stillNeeded) continue;
    if (hasGraph && block.outlookEventId) {
      await deleteTaskEvent(userId, block.outlookEventId);
    }
    await prisma.scheduleBlock.delete({ where: { id: block.id } }).catch(() => undefined);
  }

  await prisma.calendarConnection.updateMany({
    where: { userId },
    data: { lastSyncedAt: new Date() },
  });

  return result;
}
