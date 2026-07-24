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

export async function runSchedulerForUser(userId: string) {
  const prefs = await loadPrefs(userId);
  const now = new Date();
  const windowEnd = addDays(now, prefs.planningDays);

  const memberships = await prisma.workspaceMember.findMany({
    where: { userId },
    select: { workspaceId: true },
  });
  const workspaceIds = memberships.map((m) => m.workspaceId);

  const tasks = await prisma.task.findMany({
    where: {
      workspaceId: { in: workspaceIds },
      status: { in: ["TODO", "IN_PROGRESS"] },
      OR: [{ assigneeId: userId }, { assigneeId: null, createdById: userId }],
    },
  });

  let outlookBusy: BusyBlock[] = [];
  let hasGraph = true;
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

  const schedulable: SchedulableTask[] = tasks.map((t) => ({
    id: t.id,
    priority: t.priority,
    estimateMinutes: t.estimateMinutes,
    dueAt: t.dueAt,
    locked: t.locked,
    lockedStart: t.locked ? t.scheduledStart : null,
    lockedEnd: t.locked ? t.scheduledEnd : null,
    allowSplit: t.allowSplit,
    createdAt: t.createdAt,
  }));

  const result = packSchedule(schedulable, outlookBusy, now, prefs);

  // Group placements by task (splits)
  const byTask = new Map<string, typeof result.placements>();
  for (const p of result.placements) {
    const list = byTask.get(p.taskId) ?? [];
    list.push(p);
    byTask.set(p.taskId, list);
  }

  const existingBlocks = await prisma.scheduleBlock.findMany({ where: { userId } });
  const usedBlockIds = new Set<string>();

  for (const task of tasks) {
    const placements = byTask.get(task.id) ?? [];
    const primary = placements[0];
    const atRisk =
      result.unplaced.some((u) => u.taskId === task.id && u.atRisk) ||
      placements.some((p) => p.atRisk);

    if (!primary) {
      await prisma.task.update({
        where: { id: task.id },
        data: {
          scheduledStart: null,
          scheduledEnd: null,
          atRisk,
        },
      });
      continue;
    }

    // Primary window = first chunk start → last chunk end (or sum contiguous)
    const last = placements[placements.length - 1];
    await prisma.task.update({
      where: { id: task.id },
      data: {
        scheduledStart: primary.start,
        scheduledEnd: last.end,
        atRisk,
      },
    });

    // Sync each chunk as a schedule block (+ Outlook)
    const taskBlocks = existingBlocks.filter((b) => b.taskId === task.id);
    for (let i = 0; i < placements.length; i++) {
      const p = placements[i];
      let block = taskBlocks[i];
      let outlookEventId = block?.outlookEventId ?? null;

      if (hasGraph) {
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
        block = await prisma.scheduleBlock.update({
          where: { id: block.id },
          data: {
            start: p.start,
            end: p.end,
            outlookEventId,
          },
        });
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
      }
      usedBlockIds.add(block.id);

      await prisma.taskEvent.create({
        data: {
          taskId: task.id,
          actorId: userId,
          type: taskBlocks[i] ? "RESCHEDULED" : "SCHEDULED",
          payload: {
            start: p.start.toISOString(),
            end: p.end.toISOString(),
            atRisk: p.atRisk,
          },
        },
      });
    }

    // Remove extra blocks for this task
    for (let i = placements.length; i < taskBlocks.length; i++) {
      const extra = taskBlocks[i];
      if (hasGraph && extra.outlookEventId) {
        await deleteTaskEvent(userId, extra.outlookEventId);
      }
      await prisma.scheduleBlock.delete({ where: { id: extra.id } });
    }
  }

  // Cleanup orphan blocks for this user
  for (const block of existingBlocks) {
    if (usedBlockIds.has(block.id)) continue;
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
