import { v4 as uuid } from "uuid";
import {
  localDb,
  type LocalPrefs,
  type LocalScheduleBlock,
  type LocalTask,
  type LocalWorkspace,
  type OutboxOp,
} from "./db";

const DEFAULT_PREFS: LocalPrefs = {
  id: "prefs",
  workDays: [1, 2, 3, 4, 5],
  startMinutes: 540,
  endMinutes: 1020,
  breakStartMinutes: 720,
  breakEndMinutes: 780,
  planningDays: 14,
  minChunkMinutes: 25,
  bufferMinutes: 5,
  timezone: "UTC",
  tinyMinutes: 15,
  smallMinutes: 30,
  mediumMinutes: 60,
  bigMinutes: 120,
  themeColor: "#1f4d3a",
  darkMode: false,
  notificationsEnabled: true,
  notificationSnoozeMinutes: 10,
  quietHoursStart: null,
  quietHoursEnd: null,
};

export async function enqueue(op: OutboxOp) {
  await localDb.outbox.add({
    id: uuid(),
    createdAt: Date.now(),
    op,
    tries: 0,
  });
}

export async function getPrefs(): Promise<LocalPrefs> {
  const row = await localDb.prefs.get("prefs");
  return row ? { ...DEFAULT_PREFS, ...row } : DEFAULT_PREFS;
}

export async function putPrefs(patch: Partial<LocalPrefs>, sync = true) {
  const current = await getPrefs();
  const next = { ...current, ...patch, id: "prefs" as const };
  await localDb.prefs.put(next);
  if (sync) {
    const { id: _id, ...body } = next;
    await enqueue({ type: "patchPrefs", body });
  }
  return next;
}

export async function listWorkspaces(): Promise<LocalWorkspace[]> {
  return localDb.workspaces.toArray();
}

export async function getWorkspace(id: string): Promise<LocalWorkspace | undefined> {
  return localDb.workspaces.get(id);
}

export async function listTasks(workspaceId: string): Promise<LocalTask[]> {
  return localDb.tasks.where("workspaceId").equals(workspaceId).toArray();
}

export async function getTask(id: string): Promise<LocalTask | undefined> {
  return localDb.tasks.get(id);
}

export async function upsertTask(task: LocalTask) {
  await localDb.tasks.put(task);
}

export async function patchLocalTask(id: string, patch: Partial<LocalTask>, syncBody?: Record<string, unknown>) {
  const existing = await localDb.tasks.get(id);
  if (!existing) return;
  const next: LocalTask = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await localDb.tasks.put(next);
  if (syncBody) {
    await enqueue({ type: "patchTask", taskId: id, body: syncBody });
  }
  return next;
}

export async function createLocalTask(input: {
  workspaceId: string;
  title: string;
  notes?: string | null;
  emoji?: string | null;
  priority?: number;
  estimateMinutes?: number;
  bucketId?: string | null;
  assigneeId?: string | null;
  dueAt?: string | null;
  links?: { url: string; title?: string }[];
  isRecurring?: boolean;
  recurFreq?: string | null;
  recurInterval?: number;
  recurEndsAt?: string | null;
  recurCount?: number | null;
  checklist?: { text: string; done: boolean }[];
  mentionIds?: string[];
}): Promise<LocalTask> {
  const id = `local_${uuid()}`;
  const ws = await localDb.workspaces.get(input.workspaceId);
  const bucket = input.bucketId
    ? ws?.buckets.find((b) => b.id === input.bucketId) ?? null
    : null;
  const task: LocalTask = {
    id,
    workspaceId: input.workspaceId,
    bucketId: input.bucketId ?? null,
    title: input.title.trim(),
    notes: input.notes ?? null,
    emoji: input.emoji ?? null,
    headerImageKey: null,
    status: "TODO",
    priority: input.priority ?? 3,
    estimateMinutes: input.estimateMinutes ?? 30,
    dueAt: input.dueAt ?? null,
    scheduledStart: null,
    scheduledEnd: null,
    atRisk: false,
    locked: false,
    allowSplit: true,
    position: 0,
    completedAt: null,
    assigneeId: input.assigneeId ?? null,
    isRecurring: Boolean(input.isRecurring),
    updatedAt: new Date().toISOString(),
    bucket,
    _localOnly: true,
  };
  await localDb.tasks.put(task);
  await enqueue({
    type: "createTask",
    localId: id,
    body: {
      workspaceId: input.workspaceId,
      title: task.title,
      notes: task.notes,
      emoji: task.emoji,
      priority: task.priority,
      estimateMinutes: task.estimateMinutes,
      bucketId: task.bucketId,
      assigneeId: task.assigneeId,
      dueAt: task.dueAt,
      links: input.links,
      isRecurring: input.isRecurring ?? false,
      recurFreq: input.recurFreq ?? null,
      recurInterval: input.recurInterval ?? 1,
      recurEndsAt: input.recurEndsAt ?? null,
      recurCount: input.recurCount ?? null,
    },
    checklist: input.checklist,
    mentionIds: input.mentionIds,
  });
  return task;
}

export async function listScheduleBlocks(): Promise<LocalScheduleBlock[]> {
  return localDb.scheduleBlocks.orderBy("start").toArray();
}

export async function listTodayBlocks(dayStart: Date, dayEnd: Date): Promise<LocalScheduleBlock[]> {
  const blocks = await localDb.scheduleBlocks.toArray();
  const from = dayStart.getTime();
  const to = dayEnd.getTime();
  return blocks
    .filter((b) => {
      const s = new Date(b.start).getTime();
      const e = new Date(b.end).getTime();
      return s < to && e > from;
    })
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

export async function listBacklog(): Promise<LocalTask[]> {
  return localDb.backlog.toArray();
}

export async function listAtRisk(): Promise<LocalTask[]> {
  const tasks = await localDb.tasks.filter((t) => t.atRisk && t.status !== "DONE" && t.status !== "CANCELLED").toArray();
  return tasks.sort((a, b) => {
    const ad = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
    const bd = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
    return ad - bd;
  });
}

export async function replaceSchedule(blocks: LocalScheduleBlock[]) {
  await localDb.transaction("rw", localDb.scheduleBlocks, async () => {
    await localDb.scheduleBlocks.clear();
    if (blocks.length) await localDb.scheduleBlocks.bulkPut(blocks);
  });
}

export async function replaceMeetings(
  meetings: { id: string; subject: string; start: string; end: string; isMomentum: boolean }[]
) {
  await localDb.transaction("rw", localDb.meetings, async () => {
    await localDb.meetings.clear();
    if (meetings.length) await localDb.meetings.bulkPut(meetings);
  });
}

export async function outboxCount() {
  return localDb.outbox.count();
}

/** Seed a local-only workspace when the device has never synced. */
export async function ensureOfflineWorkspace(): Promise<LocalWorkspace> {
  const existing = await localDb.workspaces.toArray();
  if (existing[0]) return existing[0];
  const ws: LocalWorkspace = {
    id: "local-workspace",
    name: "My plan",
    buckets: [
      { id: "local-bucket-general", name: "General", color: "#3D6B4F", workspaceId: "local-workspace" },
    ],
    members: [],
  };
  await localDb.workspaces.put(ws);
  return ws;
}
