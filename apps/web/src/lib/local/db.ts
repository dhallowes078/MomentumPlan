import Dexie, { type EntityTable } from "dexie";

export type LocalBucket = {
  id: string;
  name: string;
  color: string;
  workspaceId?: string;
  workDays?: number[] | null;
  startMinutes?: number | null;
  endMinutes?: number | null;
  breakStartMinutes?: number | null;
  breakEndMinutes?: number | null;
  dayHours?: Partial<
    Record<
      number,
      {
        startMinutes: number;
        endMinutes: number;
        breakStartMinutes?: number | null;
        breakEndMinutes?: number | null;
      }
    >
  > | null;
};

export type LocalTask = {
  id: string;
  workspaceId: string;
  bucketId: string | null;
  title: string;
  notes: string | null;
  emoji: string | null;
  headerImageKey: string | null;
  headerImageUrl?: string | null;
  status: string;
  priority: number;
  estimateMinutes: number;
  dueAt: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  atRisk: boolean;
  locked: boolean;
  allowSplit: boolean;
  position: number;
  completedAt: string | null;
  assigneeId: string | null;
  isRecurring: boolean;
  recurFreq?: string | null;
  recurInterval?: number;
  recurByWeekdays?: number[] | null;
  recurEndsAt?: string | null;
  recurCount?: number | null;
  updatedAt: string;
  bucket?: LocalBucket | null;
  assignee?: { id: string; name: string | null; email: string; image?: string | null; color?: string | null } | null;
  _count?: { comments: number; attachments: number };
  /** Local-only: pending create not yet on server */
  _localOnly?: boolean;
};

export type LocalScheduleBlock = {
  id: string;
  taskId: string;
  userId?: string;
  start: string;
  end: string;
  completed: boolean;
  task?: Pick<
    LocalTask,
    "id" | "title" | "priority" | "atRisk" | "estimateMinutes" | "status" | "emoji"
  > & { bucket?: LocalBucket | null };
};

export type LocalWorkspace = {
  id: string;
  name: string;
  role?: string;
  buckets: LocalBucket[];
  members: {
    id: string;
    name: string | null;
    email: string;
    image?: string | null;
    color?: string | null;
  }[];
};

export type LocalPrefs = {
  id: "prefs";
  workDays: number[];
  startMinutes: number;
  endMinutes: number;
  breakStartMinutes: number | null;
  breakEndMinutes: number | null;
  dayHours?: Partial<
    Record<
      number,
      {
        startMinutes: number;
        endMinutes: number;
        breakStartMinutes?: number | null;
        breakEndMinutes?: number | null;
      }
    >
  > | null;
  planningDays: number;
  minChunkMinutes: number;
  bufferMinutes: number;
  timezone: string;
  tinyMinutes: number;
  smallMinutes: number;
  mediumMinutes: number;
  bigMinutes: number;
  themeColor: string;
  darkMode: boolean;
  notificationsEnabled: boolean;
  notificationSnoozeMinutes: number;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
};

export type OutboxOp =
  | {
      type: "createTask";
      localId: string;
      body: Record<string, unknown>;
      checklist?: { text: string; done: boolean }[];
      mentionIds?: string[];
    }
  | { type: "patchTask"; taskId: string; body: Record<string, unknown> }
  | { type: "deleteTask"; taskId: string }
  | { type: "putChecklist"; taskId: string; items: { text: string; done: boolean }[] }
  | { type: "reorder"; orderedTaskIds: string[] }
  | { type: "patchPrefs"; body: Record<string, unknown> }
  | { type: "runScheduler" };

export type OutboxItem = {
  id: string;
  createdAt: number;
  op: OutboxOp;
  tries: number;
  lastError?: string;
};

export type MetaRow = {
  key: string;
  value: string;
};

export type LocalMeeting = {
  id: string;
  subject: string;
  start: string;
  end: string;
  isMomentum: boolean;
};

class MomentumDB extends Dexie {
  tasks!: EntityTable<LocalTask, "id">;
  scheduleBlocks!: EntityTable<LocalScheduleBlock, "id">;
  workspaces!: EntityTable<LocalWorkspace, "id">;
  prefs!: EntityTable<LocalPrefs, "id">;
  outbox!: EntityTable<OutboxItem, "id">;
  meta!: EntityTable<MetaRow, "key">;
  meetings!: EntityTable<LocalMeeting, "id">;
  backlog!: EntityTable<LocalTask, "id">;

  constructor() {
    super("momentum-local-v1");
    this.version(1).stores({
      tasks: "id, workspaceId, status, priority, dueAt, updatedAt",
      scheduleBlocks: "id, taskId, start, end",
      workspaces: "id",
      prefs: "id",
      outbox: "id, createdAt",
      meta: "key",
      meetings: "id, start",
      backlog: "id, workspaceId, priority",
    });
  }
}

let _db: MomentumDB | null = null;

export function getLocalDb(): MomentumDB {
  if (typeof window === "undefined") {
    throw new Error("Local DB is browser-only");
  }
  if (!_db) _db = new MomentumDB();
  return _db;
}

/** @deprecated use getLocalDb() — kept for call-site convenience in client modules */
export const localDb = new Proxy({} as MomentumDB, {
  get(_target, prop, receiver) {
    const db = getLocalDb();
    const value = Reflect.get(db, prop, receiver);
    return typeof value === "function" ? value.bind(db) : value;
  },
});

export async function getMeta(key: string): Promise<string | null> {
  const row = await getLocalDb().meta.get(key);
  return row?.value ?? null;
}

export async function setMeta(key: string, value: string) {
  await getLocalDb().meta.put({ key, value });
}
