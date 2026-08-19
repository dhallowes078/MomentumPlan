import { v4 as uuid } from "uuid";
import { addDays, startOfDay } from "date-fns";
import {
  localDb,
  type LocalBucket,
  type LocalChecklist,
  type LocalChecklistItem,
  type LocalPrefs,
  type LocalScheduleBlock,
  type LocalTask,
  type LocalWorkspace,
  type OutboxOp,
} from "./db";
import { expandLockedOccurrences } from "@/lib/recurrence";

const DEFAULT_PREFS: LocalPrefs = {
  id: "prefs",
  workDays: [1, 2, 3, 4, 5],
  startMinutes: 540,
  endMinutes: 1020,
  breakStartMinutes: 720,
  breakEndMinutes: 780,
  dayHours: null,
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

export async function createLocalBucket(workspaceId: string, name: string, color: string) {
  let ws = await getWorkspace(workspaceId);
  if (!ws) {
    const seed = await ensureOfflineWorkspace();
    ws = { ...seed, id: workspaceId, name: seed.name };
  }
  const bucket = {
    id: `local_bucket_${uuid()}`,
    name: name.trim(),
    color,
    workspaceId,
  };
  const buckets = [...(ws.buckets ?? []), bucket];
  await localDb.workspaces.put({ ...ws, id: workspaceId, buckets });
  await enqueue({
    type: "createBucket",
    localId: bucket.id,
    workspaceId,
    name: bucket.name,
    color: bucket.color,
  });
  return bucket;
}

export async function updateLocalBucketColor(
  workspaceId: string,
  bucketId: string,
  color: string
) {
  const ws = await getWorkspace(workspaceId);
  if (!ws) return;
  await localDb.workspaces.put({
    ...ws,
    buckets: (ws.buckets ?? []).map((b) => (b.id === bucketId ? { ...b, color } : b)),
  });
}

export async function updateLocalBucketSchedule(
  workspaceId: string,
  bucketId: string,
  schedule: {
    workDays?: number[] | null;
    startMinutes?: number | null;
    endMinutes?: number | null;
    breakStartMinutes?: number | null;
    breakEndMinutes?: number | null;
    dayHours?: LocalBucket["dayHours"];
  } | null
) {
  const ws = await getWorkspace(workspaceId);
  if (!ws) return;
  await localDb.workspaces.put({
    ...ws,
    buckets: (ws.buckets ?? []).map((b) =>
      b.id === bucketId
        ? schedule
          ? { ...b, ...schedule }
          : {
              ...b,
              workDays: null,
              startMinutes: null,
              endMinutes: null,
              breakStartMinutes: null,
              breakEndMinutes: null,
              dayHours: null,
            }
        : b
    ),
  });
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
  let bucket = existing.bucket;
  if ("bucketId" in patch) {
    if (patch.bucketId) {
      const ws = await localDb.workspaces.get(existing.workspaceId);
      bucket =
        ws?.buckets?.find((b) => b.id === patch.bucketId) ??
        (patch.bucket !== undefined ? patch.bucket : existing.bucket) ??
        null;
    } else {
      bucket = null;
    }
  } else if (patch.bucket !== undefined) {
    bucket = patch.bucket;
  }
  const next: LocalTask = {
    ...existing,
    ...patch,
    bucket,
    updatedAt: new Date().toISOString(),
  };
  await localDb.tasks.put(next);
  if (syncBody) {
    await enqueue({ type: "patchTask", taskId: id, body: syncBody });
  }
  return next;
}

export async function listChecklists(workspaceId: string): Promise<LocalChecklist[]> {
  return localDb.checklists.where("workspaceId").equals(workspaceId).toArray();
}

export async function upsertLocalChecklist(
  input: {
    id?: string;
    workspaceId: string;
    title: string;
    items: LocalChecklistItem[];
    position?: number;
  },
  opts?: { enqueue?: boolean }
): Promise<LocalChecklist> {
  const existing = input.id ? await localDb.checklists.get(input.id) : undefined;
  const id = existing?.id ?? input.id ?? `local_list_${uuid()}`;
  const enqueueOp = opts?.enqueue !== false;
  const row: LocalChecklist = {
    id,
    workspaceId: input.workspaceId,
    title: enqueueOp ? input.title.trim() || "Checklist" : input.title,
    items: input.items,
    position: input.position ?? existing?.position ?? 0,
    updatedAt: new Date().toISOString(),
    _localOnly: existing?._localOnly ?? id.startsWith("local_list_"),
  };
  await localDb.checklists.put(row);

  if (!enqueueOp) return row;

  const pending = (await localDb.outbox.toArray()).find(
    (r) => r.op.type === "upsertChecklist" && r.op.id === id
  );
  const op: OutboxOp = {
    type: "upsertChecklist",
    id,
    workspaceId: row.workspaceId,
    title: row.title,
    items: row.items,
    position: row.position,
  };
  if (pending) {
    await localDb.outbox.put({ ...pending, op });
  } else {
    await enqueue(op);
  }
  return row;
}

export async function deleteLocalChecklist(id: string) {
  await localDb.checklists.delete(id);
  const pendingUpsert = (await localDb.outbox.toArray()).find(
    (r) => r.op.type === "upsertChecklist" && r.op.id === id
  );
  if (pendingUpsert) await localDb.outbox.delete(pendingUpsert.id);
  if (id.startsWith("local_list_")) return;
  await enqueue({ type: "deleteChecklist", id });
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
  locked?: boolean;
  allowSplit?: boolean;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  links?: { url: string; title?: string }[];
  isRecurring?: boolean;
  recurFreq?: string | null;
  recurInterval?: number;
  recurByWeekdays?: number[] | null;
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
  const locked = Boolean(input.locked);
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
    scheduledStart: input.scheduledStart ?? null,
    scheduledEnd: input.scheduledEnd ?? null,
    atRisk: false,
    locked,
    allowSplit: input.allowSplit !== false && !locked,
    position: 0,
    completedAt: null,
    assigneeId: input.assigneeId ?? null,
    isRecurring: Boolean(input.isRecurring),
    recurFreq: input.recurFreq ?? null,
    recurInterval: input.recurInterval ?? 1,
    recurByWeekdays: input.recurByWeekdays ?? null,
    recurEndsAt: input.recurEndsAt ?? null,
    recurCount: input.recurCount ?? null,
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
      locked: task.locked,
      allowSplit: task.allowSplit,
      scheduledStart: task.scheduledStart,
      scheduledEnd: task.scheduledEnd,
      links: input.links,
      isRecurring: input.isRecurring ?? false,
      recurFreq: input.recurFreq ?? null,
      recurInterval: input.recurInterval ?? 1,
      ...(input.recurByWeekdays?.length ? { recurByWeekdays: input.recurByWeekdays } : {}),
      recurEndsAt: input.recurEndsAt ?? null,
      recurCount: input.recurCount ?? null,
    },
    checklist: input.checklist,
    mentionIds: input.mentionIds,
  });
  if (task.locked && task.scheduledStart && task.scheduledEnd) {
    const prefs = await getPrefs();
    const from = startOfDay(new Date());
    const to = addDays(from, Math.max(prefs.planningDays ?? 14, 14) + 1);
    const windows = expandLockedOccurrences(
      {
        isRecurring: task.isRecurring,
        recurFreq: task.recurFreq,
        recurInterval: task.recurInterval,
        recurByWeekdays: task.recurByWeekdays,
        recurEndsAt: task.recurEndsAt ? new Date(task.recurEndsAt) : null,
        recurCount: task.recurCount,
        scheduledStart: new Date(task.scheduledStart),
        scheduledEnd: new Date(task.scheduledEnd),
        locked: true,
      },
      from,
      to
    );
    if (windows.length) {
      await localDb.scheduleBlocks.bulkPut(
        windows.map((w) => ({
          id: `local_block_${uuid()}`,
          taskId: task.id,
          start: w.start.toISOString(),
          end: w.end.toISOString(),
          completed: false,
          task: {
            id: task.id,
            title: task.title,
            priority: task.priority,
            atRisk: false,
            estimateMinutes: task.estimateMinutes,
            status: task.status,
            emoji: task.emoji,
            bucket,
          },
        }))
      );
    }
  }
  return task;
}

/** Hard-delete a task locally and queue remote DELETE. Clears schedule blocks. */
export async function deleteLocalTask(taskId: string) {
  const blocks = await localDb.scheduleBlocks.where("taskId").equals(taskId).toArray();
  await localDb.transaction(
    "rw",
    localDb.tasks,
    localDb.scheduleBlocks,
    localDb.backlog,
    localDb.outbox,
    async () => {
      await localDb.tasks.delete(taskId);
      await localDb.backlog.delete(taskId);
      for (const b of blocks) {
        await localDb.scheduleBlocks.delete(b.id);
      }
    }
  );
  // Skip remote delete for never-synced local drafts.
  if (!taskId.startsWith("local_")) {
    await enqueue({ type: "deleteTask", taskId });
  }
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
  if (existing[0]) {
    if (!existing[0].members?.length) {
      const patched: LocalWorkspace = {
        ...existing[0],
        members: [{ id: "local-me", name: "Me", email: "me@local", color: "#3D6B4F" }],
      };
      await localDb.workspaces.put(patched);
      return patched;
    }
    return existing[0];
  }
  const ws: LocalWorkspace = {
    id: "local-workspace",
    name: "My plan",
    buckets: [
      { id: "local-bucket-general", name: "General", color: "#3D6B4F", workspaceId: "local-workspace" },
    ],
    members: [{ id: "local-me", name: "Me", email: "me@local", color: "#3D6B4F" }],
  };
  await localDb.workspaces.put(ws);
  return ws;
}

const TEST_MARKER = "[momentum-test-mode]";

const LOCAL_TEST_BUCKETS = [
  { idSuffix: "work", name: "🧪 Test · Work", color: "#2F5D8C" },
  { idSuffix: "personal", name: "🧪 Test · Personal", color: "#8B5E3C" },
  { idSuffix: "urgent", name: "🧪 Test · Urgent", color: "#A33B2D" },
  { idSuffix: "admin", name: "🧪 Test · Admin", color: "#0F766E" },
] as const;

function testDueAt(daysFromNow: number, hour = 17) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

export async function countLocalTestTasks(workspaceId?: string) {
  const tasks = workspaceId
    ? await listTasks(workspaceId)
    : await localDb.tasks.toArray();
  return tasks.filter((t) => t.notes?.includes(TEST_MARKER)).length;
}

export async function enableLocalTestMode(workspaceId: string) {
  const existing = await countLocalTestTasks(workspaceId);
  if (existing > 0) return { count: existing, alreadyActive: true };

  let ws = await getWorkspace(workspaceId);
  if (!ws) {
    const seed = await ensureOfflineWorkspace();
    ws = {
      ...seed,
      id: workspaceId,
      name: seed.name,
    };
  }

  const bucketIds = new Map<string, string>();
  const buckets = [...(ws.buckets ?? [])];

  for (const bucket of LOCAL_TEST_BUCKETS) {
    const id = `local-test-bucket-${bucket.idSuffix}`;
    const found = buckets.find((b) => b.id === id || b.name === bucket.name);
    if (!found) {
      buckets.push({ id, name: bucket.name, color: bucket.color, workspaceId });
      bucketIds.set(bucket.idSuffix, id);
    } else {
      bucketIds.set(bucket.idSuffix, found.id);
    }
  }

  const me =
    ws.members[0]?.id ??
    ({ id: "local-me", name: "Me", email: "me@local", color: "#3D6B4F" } as const).id;
  const members = ws.members.length
    ? ws.members
    : [{ id: "local-me", name: "Me", email: "me@local", color: "#3D6B4F" }];

  await localDb.workspaces.put({ ...ws, id: workspaceId, buckets, members });

  const samples = [
    { title: "Submit quarterly report", bucket: "urgent", priority: 5, estimateMinutes: 90, due: -1, notes: "Overdue high-priority task." },
    { title: "Prepare client presentation", bucket: "work", priority: 5, estimateMinutes: 120, due: 0, notes: "Due today with a larger estimate." },
    { title: "Call the dentist", bucket: "personal", priority: 4, estimateMinutes: 15, due: 0, notes: "Small personal task due today." },
    { title: "Review pull request", bucket: "work", priority: 4, estimateMinutes: 45, due: 1, notes: "Technical review sample." },
    { title: "Renew home insurance", bucket: "admin", priority: 4, estimateMinutes: 30, due: 2, notes: "Administrative near-term task." },
    { title: "Plan next sprint", bucket: "work", priority: 3, estimateMinutes: 60, due: 3, notes: "Medium scheduling sample." },
    { title: "Book train tickets", bucket: "personal", priority: 3, estimateMinutes: 30, due: 4, notes: "Personal future deadline." },
    { title: "Process inbox", bucket: "admin", priority: 3, estimateMinutes: 25, due: 1, notes: "Short admin task." },
    { title: "Draft project brief", bucket: "work", priority: 2, estimateMinutes: 75, due: 7, notes: "Lower-priority work item." },
    { title: "Buy birthday gift", bucket: "personal", priority: 2, estimateMinutes: 45, due: 10, notes: "Future personal task." },
    { title: "Archive old documents", bucket: "admin", priority: 1, estimateMinutes: 120, due: 14, notes: "Large low-priority task." },
    { title: "Read industry newsletter", bucket: "work", priority: 1, estimateMinutes: 20, due: 5, notes: "Tiny low-priority task." },
    { title: "Complete onboarding checklist", bucket: "admin", priority: 3, estimateMinutes: 30, due: -2, notes: "Completed sample task.", done: true },
    { title: "Weekly planning review", bucket: "work", priority: 4, estimateMinutes: 40, due: 6, notes: "Recurring weekly sample.", isRecurring: true },
  ];

  for (const sample of samples) {
    const task = await createLocalTask({
      workspaceId,
      title: sample.title,
      notes: `${sample.notes}\n\n${TEST_MARKER}`,
      priority: sample.priority,
      estimateMinutes: sample.estimateMinutes,
      bucketId: bucketIds.get(sample.bucket) ?? null,
      assigneeId: me,
      dueAt: testDueAt(sample.due),
      isRecurring: Boolean(sample.isRecurring),
      recurFreq: sample.isRecurring ? "WEEKLY" : null,
    });
    if (sample.done) {
      await patchLocalTask(task.id, {
        status: "DONE",
        completedAt: new Date().toISOString(),
      });
    }
  }

  await enqueue({ type: "runScheduler" });
  const { runLocalScheduler } = await import("./scheduler");
  await runLocalScheduler();
  return { count: samples.length, alreadyActive: false };
}

export async function disableLocalTestMode(workspaceId?: string) {
  const allTasks = await localDb.tasks.toArray();
  const testTasks = allTasks.filter(
    (t) =>
      t.notes?.includes(TEST_MARKER) &&
      (!workspaceId || t.workspaceId === workspaceId)
  );
  const removedIds = new Set(testTasks.map((t) => t.id));

  await localDb.transaction("rw", localDb.tasks, localDb.scheduleBlocks, localDb.workspaces, async () => {
    for (const task of testTasks) {
      await localDb.tasks.delete(task.id);
    }

    const blocks = await localDb.scheduleBlocks.toArray();
    const blockIds = blocks.filter((b) => removedIds.has(b.taskId)).map((b) => b.id);
    if (blockIds.length) await localDb.scheduleBlocks.bulkDelete(blockIds);

    const workspaces = await localDb.workspaces.toArray();
    for (const ws of workspaces) {
      if (workspaceId && ws.id !== workspaceId) continue;
      const nextBuckets = (ws.buckets ?? []).filter(
        (b) =>
          !LOCAL_TEST_BUCKETS.some(
            (tb) => tb.name === b.name || b.id === `local-test-bucket-${tb.idSuffix}`
          )
      );
      if (nextBuckets.length !== (ws.buckets ?? []).length) {
        await localDb.workspaces.put({ ...ws, buckets: nextBuckets });
      }
    }
  });

  // Repack remaining real tasks so calendar/today stay consistent.
  try {
    const { runLocalScheduler } = await import("./scheduler");
    await runLocalScheduler();
  } catch {
    /* offline packer optional */
  }

  return { removed: testTasks.length };
}
