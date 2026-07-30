import { startOfDay, endOfDay } from "date-fns";
import { localDb, setMeta, type LocalTask, type LocalWorkspace } from "./db";
import * as repo from "./repo";
import { apiFetch, apiUrl, getDeviceToken, getSyncApiBase } from "@/lib/sync-api";
import { parseDayHours } from "@/lib/day-hours";

export type SyncStatus = "idle" | "syncing" | "offline" | "error";

type Listener = (s: { status: SyncStatus; pending: number; lastError?: string }) => void;

let status: SyncStatus = "idle";
let lastError: string | undefined;
let flushing = false;
const listeners = new Set<Listener>();

function emit() {
  void repo.outboxCount().then((pending) => {
    const snapshot = { status, pending, lastError };
    listeners.forEach((l) => l(snapshot));
  });
}

export function subscribeSync(listener: Listener) {
  listeners.add(listener);
  emit();
  return () => {
    listeners.delete(listener);
  };
}

export function getSyncSnapshot() {
  return { status, lastError };
}

function setStatus(next: SyncStatus, err?: string) {
  status = next;
  lastError = err;
  emit();
}

/** True when we have a remote API base and a device token (native sync mode). */
export function canSyncRemote() {
  // Same-origin web app can sync with cookie session without a stored token.
  if (!getSyncApiBase()) return true;
  return Boolean(getDeviceToken());
}

function syncFailMessage(kind: string, res: Response, body: unknown) {
  const detail =
    body && typeof body === "object" && "error" in body && typeof (body as { error: unknown }).error === "string"
      ? String((body as { error: string }).error)
      : "";
  // Keep short — shown in Sync issue dialog.
  let clipped = detail.length > 160 ? `${detail.slice(0, 157)}…` : detail;
  if (res.status === 403) {
    clipped =
      clipped && clipped.toLowerCase() !== "forbidden"
        ? clipped
        : "No access to that workspace — often a leftover offline id. Sync will remap; or re-link device.";
  }
  return clipped ? `${kind} ${res.status}: ${clipped}` : `${kind} ${res.status}`;
}

/** Prefer a real server workspace over offline seeds like `local-workspace`. */
async function canonicalWorkspaceId(preferred?: string | null): Promise<string | null> {
  const workspaces = await localDb.workspaces.toArray();
  const server = workspaces.filter((w) => !w.id.startsWith("local"));
  if (preferred && server.some((w) => w.id === preferred)) return preferred;
  return server[0]?.id ?? null;
}

/**
 * After linking / pull: rewrite offline workspace ids on tasks + outbox so
 * create/patch stop getting 403 Forbidden against `local-workspace`.
 */
async function migrateOfflineWorkspaceRefs(targetWorkspaceId: string) {
  const offlineIds = new Set(
    (await localDb.workspaces.toArray())
      .map((w) => w.id)
      .filter((id) => id.startsWith("local"))
  );
  // Also migrate tasks/outbox still pointing at local-* even if that row was cleared.
  offlineIds.add("local-workspace");

  const tasks = await localDb.tasks.toArray();
  for (const t of tasks) {
    if (!offlineIds.has(t.workspaceId) && !t.workspaceId.startsWith("local")) continue;
    await localDb.tasks.put({ ...t, workspaceId: targetWorkspaceId });
  }

  const outbox = await localDb.outbox.toArray();
  for (const row of outbox) {
    const op = row.op;
    if (op.type === "createTask") {
      const ws = String(op.body.workspaceId ?? "");
      if (!ws.startsWith("local") && !offlineIds.has(ws)) continue;
      await localDb.outbox.put({
        ...row,
        op: {
          ...op,
          body: { ...op.body, workspaceId: targetWorkspaceId },
        },
      });
    } else if (op.type === "createBucket") {
      if (!op.workspaceId.startsWith("local") && !offlineIds.has(op.workspaceId)) continue;
      await localDb.outbox.put({
        ...row,
        op: { ...op, workspaceId: targetWorkspaceId },
      });
    }
  }
}

/** Normalize createTask outbox payloads so Zod/API won't 400 on nulls / local ids. */
function sanitizeCreateTaskBody(body: Record<string, unknown>, userIdHint?: string | null) {
  const out: Record<string, unknown> = { ...body };

  const asIsoOrNull = (v: unknown) => {
    if (v == null || v === "") return null;
    if (typeof v !== "string") return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  };

  out.dueAt = asIsoOrNull(out.dueAt);
  out.scheduledStart = asIsoOrNull(out.scheduledStart);
  out.scheduledEnd = asIsoOrNull(out.scheduledEnd);
  out.recurEndsAt = asIsoOrNull(out.recurEndsAt);

  if (typeof out.estimateMinutes === "number") {
    out.estimateMinutes = Math.max(5, Math.min(8 * 60, Math.round(out.estimateMinutes)));
  }

  if (typeof out.bucketId === "string" && out.bucketId.startsWith("local")) {
    // Still waiting for createBucket remap — omit so create can succeed.
    out.bucketId = null;
  }
  if (typeof out.assigneeId === "string" && out.assigneeId.startsWith("local")) {
    out.assigneeId = userIdHint ?? null;
  }

  if (out.recurByWeekdays != null && !Array.isArray(out.recurByWeekdays)) {
    out.recurByWeekdays = null;
  }

  if (typeof out.emoji === "string" && out.emoji.length > 16) {
    out.emoji = out.emoji.slice(0, 16);
  }

  // Drop empty links that fail url().
  if (Array.isArray(out.links)) {
    out.links = (out.links as { url?: string; title?: string }[]).filter(
      (l) => typeof l?.url === "string" && /^https?:\/\//i.test(l.url)
    );
    if (!(out.links as unknown[]).length) delete out.links;
  }

  return out;
}

async function safeJson<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await apiFetch(path, init);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function normalizeTask(t: Record<string, unknown>): LocalTask {
  return {
    id: String(t.id),
    workspaceId: String(t.workspaceId),
    bucketId: (t.bucketId as string | null) ?? null,
    title: String(t.title ?? ""),
    notes: (t.notes as string | null) ?? null,
    emoji: (t.emoji as string | null) ?? null,
    headerImageKey: (t.headerImageKey as string | null) ?? null,
    headerImageUrl: (t.headerImageUrl as string | null) ?? null,
    status: String(t.status ?? "TODO"),
    priority: Number(t.priority ?? 3),
    estimateMinutes: Number(t.estimateMinutes ?? 30),
    dueAt: t.dueAt ? String(t.dueAt) : null,
    scheduledStart: t.scheduledStart ? String(t.scheduledStart) : null,
    scheduledEnd: t.scheduledEnd ? String(t.scheduledEnd) : null,
    atRisk: Boolean(t.atRisk),
    locked: Boolean(t.locked),
    allowSplit: t.allowSplit !== false,
    position: Number(t.position ?? 0),
    completedAt: t.completedAt ? String(t.completedAt) : null,
    assigneeId: (t.assigneeId as string | null) ?? null,
    isRecurring: Boolean(t.isRecurring),
    recurFreq: (t.recurFreq as string | null) ?? null,
    recurInterval: Number(t.recurInterval ?? 1),
    recurByWeekdays: Array.isArray(t.recurByWeekdays)
      ? (t.recurByWeekdays as number[])
      : null,
    recurEndsAt: t.recurEndsAt ? String(t.recurEndsAt) : null,
    recurCount: t.recurCount != null ? Number(t.recurCount) : null,
    updatedAt: t.updatedAt ? String(t.updatedAt) : new Date().toISOString(),
    bucket: (t.bucket as LocalTask["bucket"]) ?? null,
    assignee: (t.assignee as LocalTask["assignee"]) ?? null,
    _count: t._count as LocalTask["_count"],
    _localOnly: false,
  };
}

export async function pullFromServer() {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    setStatus("offline");
    return;
  }
  if (getSyncApiBase() && !getDeviceToken()) {
    // Native offline / not linked yet — stay local-only.
    setStatus("idle");
    return;
  }
  setStatus("syncing");

  const wsPayload = await safeJson<{ workspaces: LocalWorkspace[] }>("/api/workspaces");
  if (!wsPayload?.workspaces?.length) {
    // Distinguish "empty account" from auth/network failure when a device token is set.
    if (getDeviceToken()) {
      try {
        const res = await apiFetch("/api/workspaces");
        if (res.status === 401 || res.status === 403) {
          setStatus("error", "Device code expired or invalid — re-link in Settings");
          return;
        }
        if (!res.ok) {
          setStatus("error", `Could not load workspaces (${res.status})`);
          return;
        }
        // Empty list is a valid new account.
      } catch {
        setStatus("error", "Could not reach sync server");
        return;
      }
    }
    setStatus(navigator.onLine ? "idle" : "offline");
    return;
  }

  const existingWorkspaces = await localDb.workspaces.toArray();
  const existingById = new Map(existingWorkspaces.map((w) => [w.id, w]));
  // Preserve unsynced buckets from offline / previous workspace rows.
  const pendingLocalBuckets = existingWorkspaces.flatMap((w) =>
    (w.buckets ?? []).filter(
      (b) => b.id.startsWith("local_bucket_") || b.id.startsWith("local-")
    )
  );
  const pendingById = new Map(pendingLocalBuckets.map((b) => [b.id, b]));

  const workspaces: LocalWorkspace[] = [];
  for (const w of wsPayload.workspaces) {
    const detail = await safeJson<{
      workspace: {
        id: string;
        name: string;
        buckets: LocalWorkspace["buckets"];
        members: { user: LocalWorkspace["members"][number]; role: string }[];
      };
    }>(`/api/workspaces/${w.id}`);
    const prev = existingById.get(w.id);
    if (detail?.workspace) {
      const serverBuckets = (detail.workspace.buckets ?? []).map((b) => ({
        ...b,
        dayHours: parseDayHours(b.dayHours),
      }));
      const serverIds = new Set(serverBuckets.map((b) => b.id));
      // Keep unsynced local buckets until createBucket outbox remaps them.
      const pendingLocal = (prev?.buckets ?? []).filter(
        (b) =>
          (b.id.startsWith("local_bucket_") || b.id.startsWith("local-")) &&
          !serverIds.has(b.id)
      );
      workspaces.push({
        id: detail.workspace.id,
        name: detail.workspace.name,
        buckets: [...serverBuckets, ...pendingLocal],
        members: (detail.workspace.members ?? []).map((m) => m.user),
      });
    } else if (prev) {
      // Detail fetch failed (often Worker 1101) — never wipe buckets to [].
      workspaces.push(prev);
    } else {
      workspaces.push({
        id: w.id,
        name: w.name,
        buckets: [],
        members: [],
      });
    }
  }

  // Attach any leftover offline buckets to the first server workspace.
  if (workspaces[0] && pendingById.size) {
    const attached = new Set(workspaces.flatMap((w) => (w.buckets ?? []).map((b) => b.id)));
    const extras = [...pendingById.values()].filter((b) => !attached.has(b.id));
    if (extras.length) {
      workspaces[0] = {
        ...workspaces[0],
        buckets: [
          ...workspaces[0].buckets,
          ...extras.map((b) => ({ ...b, workspaceId: workspaces[0].id })),
        ],
      };
    }
  }

  await localDb.workspaces.clear();
  await localDb.workspaces.bulkPut(workspaces);

  // Rewrite local-workspace refs before task reconcile / flush.
  if (workspaces[0] && !workspaces[0].id.startsWith("local")) {
    await migrateOfflineWorkspaceRefs(workspaces[0].id);
  }

  const pendingCreates = await localDb.tasks.filter((t) => Boolean(t._localOnly)).toArray();
  const pendingIds = new Set(pendingCreates.map((t) => t.id));
  const outboxItems = await localDb.outbox.toArray();
  const protectedTaskIds = new Set<string>();
  for (const item of outboxItems) {
    const op = item.op;
    // Only protect never-synced creates. Pending patches must not keep deleted
    // server tasks alive as calendar/task ghosts.
    if (op.type === "createTask") protectedTaskIds.add(op.localId);
  }

  for (const ws of workspaces) {
    const data = await safeJson<{ tasks: Record<string, unknown>[] }>(
      `/api/tasks?${new URLSearchParams({ workspaceId: ws.id })}`
    );
    // Only reconcile when we got a real array — never treat a failed fetch as "delete all".
    if (!data || !Array.isArray(data.tasks)) continue;
    const serverTasks = data.tasks.map(normalizeTask);
    const removedIds: string[] = [];
    await localDb.transaction("rw", localDb.tasks, localDb.scheduleBlocks, async () => {
      const existing = await localDb.tasks.where("workspaceId").equals(ws.id).toArray();
      for (const t of existing) {
        if (
          !pendingIds.has(t.id) &&
          !protectedTaskIds.has(t.id) &&
          !serverTasks.some((s) => s.id === t.id)
        ) {
          removedIds.push(t.id);
          await localDb.tasks.delete(t.id);
        }
      }
      await localDb.tasks.bulkPut(serverTasks);
      for (const id of removedIds) {
        const orphans = await localDb.scheduleBlocks.where("taskId").equals(id).toArray();
        for (const b of orphans) await localDb.scheduleBlocks.delete(b.id);
      }
    });
  }

  // Drop tasks that belong to workspaces we no longer have (old offline seeds, etc.).
  const knownWs = new Set(workspaces.map((w) => w.id));
  const strayTasks = await localDb.tasks
    .filter((t) => !knownWs.has(t.workspaceId) && !pendingIds.has(t.id) && !protectedTaskIds.has(t.id))
    .toArray();
  for (const t of strayTasks) {
    await localDb.tasks.delete(t.id);
    const orphans = await localDb.scheduleBlocks.where("taskId").equals(t.id).toArray();
    for (const b of orphans) await localDb.scheduleBlocks.delete(b.id);
  }

  // Also drop any schedule blocks whose task no longer exists locally.
  const allTasks = await localDb.tasks.toArray();
  const liveIds = new Set(allTasks.map((t) => t.id));
  const allBlocks = await localDb.scheduleBlocks.toArray();
  for (const b of allBlocks) {
    if (!liveIds.has(b.taskId)) {
      await localDb.scheduleBlocks.delete(b.id);
    } else {
      const task = allTasks.find((t) => t.id === b.taskId);
      if (task && (task.status === "DONE" || task.status === "CANCELLED") && !b.completed) {
        await localDb.scheduleBlocks.put({ ...b, completed: true, task: { ...b.task!, status: task.status } });
      }
    }
  }

  const today = await safeJson<{
    blocks: {
      id: string;
      start: string;
      end: string;
      completed: boolean;
      task: LocalTask & { bucket?: LocalTask["bucket"] };
    }[];
    backlog: LocalTask[];
    atRisk: LocalTask[];
  }>("/api/today");

  if (today) {
    await localDb.backlog.clear();
    if (today.backlog?.length) {
      await localDb.backlog.bulkPut(
        today.backlog.map((t) => normalizeTask(t as unknown as Record<string, unknown>))
      );
    }
  }

  const cal = await safeJson<{
    blocks: {
      id: string;
      start: string;
      end: string;
      completed?: boolean;
      task: LocalTask & { bucket?: LocalTask["bucket"] };
    }[];
    meetings: { id: string; subject: string; start: string; end: string; isMomentum: boolean }[];
  }>("/api/calendar?days=21");

  if (cal) {
    // Always replace — including empty — so deleted tasks disappear from calendar.
    // Only keep blocks for tasks that still exist locally and are open.
    const openIds = new Set(
      (await localDb.tasks.toArray())
        .filter((t) => t.status !== "DONE" && t.status !== "CANCELLED")
        .map((t) => t.id)
    );
    await repo.replaceSchedule(
      (cal.blocks ?? [])
        .filter((b) => openIds.has(b.task.id))
        .map((b) => ({
        id: b.id,
        taskId: b.task.id,
        start: typeof b.start === "string" ? b.start : new Date(b.start).toISOString(),
        end: typeof b.end === "string" ? b.end : new Date(b.end).toISOString(),
        completed: Boolean(b.completed),
        task: {
          id: b.task.id,
          title: b.task.title,
          priority: b.task.priority,
          atRisk: b.task.atRisk,
          estimateMinutes: b.task.estimateMinutes,
          status: b.task.status,
          emoji: b.task.emoji ?? null,
          bucket: b.task.bucket ?? null,
        },
      }))
    );
    await repo.replaceMeetings(cal.meetings ?? []);
  } else if (today?.blocks) {
    // Calendar fetch failed — at least refresh today's blocks.
    const openIds = new Set(
      (await localDb.tasks.toArray())
        .filter((t) => t.status !== "DONE" && t.status !== "CANCELLED")
        .map((t) => t.id)
    );
    await repo.replaceSchedule(
      today.blocks
        .filter((b) => openIds.has(b.task.id))
        .map((b) => ({
        id: b.id,
        taskId: b.task.id,
        start: typeof b.start === "string" ? b.start : new Date(b.start).toISOString(),
        end: typeof b.end === "string" ? b.end : new Date(b.end).toISOString(),
        completed: Boolean(b.completed),
        task: {
          id: b.task.id,
          title: b.task.title,
          priority: b.task.priority,
          atRisk: b.task.atRisk,
          estimateMinutes: b.task.estimateMinutes,
          status: b.task.status,
          emoji: b.task.emoji ?? null,
          bucket: b.task.bucket ?? null,
        },
      }))
    );
  }

  const prefsPayload = await safeJson<{ prefs: Record<string, unknown> }>("/api/prefs");
  if (prefsPayload?.prefs) {
    const p = prefsPayload.prefs;
    await repo.putPrefs(
      {
        workDays: Array.isArray(p.workDays) ? (p.workDays as number[]) : [1, 2, 3, 4, 5],
        startMinutes: Number(p.startMinutes ?? 540),
        endMinutes: Number(p.endMinutes ?? 1020),
        breakStartMinutes: (p.breakStartMinutes as number | null) ?? null,
        breakEndMinutes: (p.breakEndMinutes as number | null) ?? null,
        dayHours: (() => {
          const raw = p.dayHours;
          if (!raw || typeof raw !== "object") return null;
          const out: Record<number, { startMinutes: number; endMinutes: number }> = {};
          for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
            const dow = Number(k);
            if (!Number.isInteger(dow) || !v || typeof v !== "object") continue;
            const hours = v as { startMinutes?: number; endMinutes?: number };
            if (typeof hours.startMinutes === "number" && typeof hours.endMinutes === "number") {
              out[dow] = { startMinutes: hours.startMinutes, endMinutes: hours.endMinutes };
            }
          }
          return Object.keys(out).length ? out : null;
        })(),
        planningDays: Number(p.planningDays ?? 14),
        minChunkMinutes: Number(p.minChunkMinutes ?? 25),
        bufferMinutes: Number(p.bufferMinutes ?? 5),
        timezone: String(p.timezone ?? "UTC"),
        tinyMinutes: Number(p.tinyMinutes ?? 15),
        smallMinutes: Number(p.smallMinutes ?? 30),
        mediumMinutes: Number(p.mediumMinutes ?? 60),
        bigMinutes: Number(p.bigMinutes ?? 120),
        themeColor: String(p.themeColor ?? "#1f4d3a"),
        darkMode: Boolean(p.darkMode),
        notificationsEnabled: p.notificationsEnabled !== false,
        notificationSnoozeMinutes: Number(p.notificationSnoozeMinutes ?? 10),
        quietHoursStart: (p.quietHoursStart as number | null) ?? null,
        quietHoursEnd: (p.quietHoursEnd as number | null) ?? null,
      },
      false
    );
    try {
      const { applyTheme } = await import("@/lib/theme");
      applyTheme(String(p.themeColor ?? "#1f4d3a"), Boolean(p.darkMode));
    } catch {
      // theme optional during sync
    }
  }

  await setMeta("lastSyncAt", new Date().toISOString());
  setStatus("idle");

  try {
    const { rescheduleTaskNotifications } = await import("./notifications");
    await rescheduleTaskNotifications();
  } catch {
    // notifications optional on web
  }

  try {
    const { syncHomeWidget } = await import("./widget-sync");
    await syncHomeWidget();
  } catch {
    // android widget optional
  }
}

export async function flushOutbox() {
  if (flushing) return;

  // Local packer can run without network / device token.
  // Never call /api/schedule/run here — it is CPU-heavy and causes Worker Error 1101
  // when flushed after every edit.
  const pending = await localDb.outbox.orderBy("createdAt").toArray();
  for (const item of pending) {
    if (item.op.type !== "runScheduler") continue;
    try {
      const { runLocalScheduler } = await import("./scheduler");
      await runLocalScheduler();
      await localDb.outbox.delete(item.id);
    } catch (e) {
      await localDb.outbox.update(item.id, {
        tries: item.tries + 1,
        lastError: e instanceof Error ? e.message : "local schedule failed",
      });
    }
  }

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    setStatus("offline");
    return;
  }
  if (getSyncApiBase() && !getDeviceToken()) {
    setStatus("idle");
    return;
  }
  flushing = true;
  setStatus("syncing");
  try {
    // If outbox still targets offline workspace ids, fetch memberships and remap
    // before POSTs (avoids create/createBucket 403 Forbidden).
    const early = await localDb.outbox.toArray();
    const needsWsRemap = early.some((row) => {
      if (row.op.type === "createTask") {
        return String(row.op.body.workspaceId ?? "").startsWith("local");
      }
      if (row.op.type === "createBucket") {
        return row.op.workspaceId.startsWith("local");
      }
      return false;
    });
    const hasServerWs = (await localDb.workspaces.toArray()).some(
      (w) => !w.id.startsWith("local")
    );
    if (needsWsRemap || !hasServerWs) {
      const wsPayload = await safeJson<{ workspaces: { id: string; name: string }[] }>(
        "/api/workspaces"
      );
      if (wsPayload?.workspaces?.length) {
        for (const w of wsPayload.workspaces) {
          const existing = await localDb.workspaces.get(w.id);
          if (!existing) {
            await localDb.workspaces.put({
              id: w.id,
              name: w.name,
              buckets: [],
              members: [],
            });
          }
        }
        const target = wsPayload.workspaces[0].id;
        await migrateOfflineWorkspaceRefs(target);
      }
    }

    // Prefer createBucket before task ops so local_bucket_* ids remap first.
    const items = (await localDb.outbox.orderBy("createdAt").toArray()).sort((a, b) => {
      const rank = (t: string) => (t === "createBucket" ? 0 : t === "createTask" ? 1 : 2);
      const d = rank(a.op.type) - rank(b.op.type);
      return d !== 0 ? d : a.createdAt - b.createdAt;
    });
    for (const item of items) {
      try {
        const op = item.op;
        if (op.type === "createTask") {
          const body = sanitizeCreateTaskBody(op.body);
          const wsId = await canonicalWorkspaceId(String(body.workspaceId ?? ""));
          if (!wsId) {
            throw new Error("create blocked: no server workspace yet — pull to refresh");
          }
          body.workspaceId = wsId;
          // Persist remap so retries don't keep the offline id.
          if (op.body.workspaceId !== wsId) {
            await localDb.outbox.put({
              ...item,
              op: { ...op, body: { ...op.body, workspaceId: wsId } },
            });
            const local = await localDb.tasks.get(op.localId);
            if (local && local.workspaceId !== wsId) {
              await localDb.tasks.put({ ...local, workspaceId: wsId });
            }
          }
          // If bucket still local-only, wait until createBucket remaps (don't burn retries).
          if (
            typeof op.body.bucketId === "string" &&
            String(op.body.bucketId).startsWith("local")
          ) {
            const pendingBuckets = await localDb.outbox.toArray();
            const stillLocal = pendingBuckets.some(
              (row) =>
                row.op.type === "createBucket" &&
                row.op.localId === op.body.bucketId
            );
            if (stillLocal) {
              continue;
            }
            body.bucketId = null;
          }
          const res = await apiFetch("/api/tasks", {
            method: "POST",
            body: JSON.stringify(body),
          });
          if (!res.ok) {
            const errBody = await res.json().catch(() => null);
            // 403 after remap = not our workspace — drop create so sync can continue.
            if (res.status === 403) {
              await dropLocalTaskAndBlocks(op.localId);
              await localDb.outbox.delete(item.id);
              continue;
            }
            throw new Error(syncFailMessage("create", res, errBody));
          }
          const data = await res.json();
          const serverId = data.task?.id as string;
          if (serverId) {
            const local = await localDb.tasks.get(op.localId);
            if (local) {
              await localDb.tasks.delete(op.localId);
              await localDb.tasks.put({
                ...local,
                id: serverId,
                bucketId: (body.bucketId as string | null) ?? local.bucketId,
                _localOnly: false,
              });
            }
            // Remap any schedule blocks packed under the temporary local id.
            const orphanBlocks = await localDb.scheduleBlocks
              .where("taskId")
              .equals(op.localId)
              .toArray();
            for (const b of orphanBlocks) {
              await localDb.scheduleBlocks.delete(b.id);
              await localDb.scheduleBlocks.put({
                ...b,
                taskId: serverId,
                task: b.task ? { ...b.task, id: serverId } : b.task,
              });
            }
            if (op.checklist?.length) {
              await apiFetch(`/api/tasks/${serverId}/checklist`, {
                method: "PUT",
                body: JSON.stringify({ items: op.checklist }),
              });
            }
            if (op.mentionIds?.length) {
              await apiFetch(`/api/tasks/${serverId}`, {
                method: "PATCH",
                body: JSON.stringify({ mentionIds: op.mentionIds }),
              });
            }
          }
        } else if (op.type === "patchTask") {
          if (String(op.taskId).startsWith("local")) {
            // Never synced — patch is meaningless on the server; drop it.
            await localDb.outbox.delete(item.id);
            continue;
          }
          const body = { ...op.body };
          if (typeof body.bucketId === "string" && body.bucketId.startsWith("local")) {
            body.bucketId = null;
          }
          const res = await apiFetch(`/api/tasks/${op.taskId}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          });
          if (res.status === 404 || res.status === 403) {
            // Gone or not ours — drop ghost so one bad patch cannot block the whole queue.
            await dropLocalTaskAndBlocks(op.taskId);
          } else if (!res.ok) {
            const errBody = await res.json().catch(() => null);
            throw new Error(syncFailMessage("patch", res, errBody));
          }
        } else if (op.type === "deleteTask") {
          // Never try to DELETE temporary local ids on the server.
          if (String(op.taskId).startsWith("local")) {
            await localDb.outbox.delete(item.id);
            continue;
          }
          const res = await apiFetch(`/api/tasks/${op.taskId}`, { method: "DELETE" });
          // 404/403 = already gone or not ours — treat as success.
          if (!res.ok && res.status !== 404 && res.status !== 403) {
            const errBody = await res.json().catch(() => null);
            throw new Error(syncFailMessage("delete", res, errBody));
          }
        } else if (op.type === "createBucket") {
          const wsId = await canonicalWorkspaceId(op.workspaceId);
          if (!wsId) {
            throw new Error("createBucket blocked: no server workspace yet — pull to refresh");
          }
          if (op.workspaceId !== wsId) {
            await localDb.outbox.put({
              ...item,
              op: { ...op, workspaceId: wsId },
            });
          }
          const res = await apiFetch("/api/buckets", {
            method: "POST",
            body: JSON.stringify({
              workspaceId: wsId,
              name: op.name,
              color: op.color,
            }),
          });
          if (!res.ok) {
            const errBody = await res.json().catch(() => null);
            if (res.status === 403) {
              // Drop orphan bucket create for a workspace we can't access.
              await localDb.outbox.delete(item.id);
              continue;
            }
            throw new Error(syncFailMessage("createBucket", res, errBody));
          }
          const data = await res.json();
          const serverId = data.bucket?.id as string | undefined;
          if (serverId) {
            const ws = await localDb.workspaces.get(wsId);
            if (ws) {
              await localDb.workspaces.put({
                ...ws,
                buckets: (ws.buckets ?? []).map((b) =>
                  b.id === op.localId
                    ? {
                        ...b,
                        id: serverId,
                        name: data.bucket.name ?? b.name,
                        color: data.bucket.color ?? b.color,
                      }
                    : b
                ),
              });
            }
            // Remap tasks that already reference the temporary bucket id.
            const tasks = await localDb.tasks
              .filter((t) => t.bucketId === op.localId)
              .toArray();
            for (const t of tasks) {
              await localDb.tasks.put({
                ...t,
                bucketId: serverId,
                bucket: {
                  id: serverId,
                  name: data.bucket.name ?? op.name,
                  color: data.bucket.color ?? op.color,
                },
              });
            }
            // Remap pending patchTask / createTask bodies that still point at the local bucket.
            const pendingPatches = await localDb.outbox.toArray();
            for (const row of pendingPatches) {
              if (row.op.type === "patchTask") {
                if (row.op.body?.bucketId !== op.localId) continue;
                await localDb.outbox.put({
                  ...row,
                  op: {
                    ...row.op,
                    body: { ...row.op.body, bucketId: serverId },
                  },
                });
              } else if (row.op.type === "createTask") {
                if (row.op.body?.bucketId !== op.localId) continue;
                await localDb.outbox.put({
                  ...row,
                  op: {
                    ...row.op,
                    body: { ...row.op.body, bucketId: serverId },
                  },
                });
              }
            }
          }
        } else if (op.type === "putChecklist") {
          const res = await apiFetch(`/api/tasks/${op.taskId}/checklist`, {
            method: "PUT",
            body: JSON.stringify({ items: op.items }),
          });
          if (!res.ok) throw new Error(`checklist ${res.status}`);
        } else if (op.type === "reorder") {
          const res = await apiFetch("/api/tasks/reorder", {
            method: "POST",
            body: JSON.stringify({ updates: op.orderedTaskIds.map((id, position) => ({ id, position })) }),
          });
          if (!res.ok) throw new Error(`reorder ${res.status}`);
        } else if (op.type === "patchPrefs") {
          const res = await apiFetch("/api/prefs", {
            method: "PATCH",
            body: JSON.stringify(op.body),
          });
          if (!res.ok) throw new Error(`prefs ${res.status}`);
        } else if (op.type === "runScheduler") {
          // Should already be drained above; local-only safety net.
          const { runLocalScheduler } = await import("./scheduler");
          await runLocalScheduler();
        }
        await localDb.outbox.delete(item.id);
      } catch (e) {
        await localDb.outbox.update(item.id, {
          tries: item.tries + 1,
          lastError: e instanceof Error ? e.message : "sync failed",
        });
        setStatus("error", e instanceof Error ? e.message : "sync failed");
        break;
      }
    }
    if (status !== "error") setStatus("idle");
  } finally {
    flushing = false;
    emit();
  }
}

async function dropLocalTaskAndBlocks(taskId: string) {
  await localDb.tasks.delete(taskId);
  const orphans = await localDb.scheduleBlocks.where("taskId").equals(taskId).toArray();
  for (const b of orphans) await localDb.scheduleBlocks.delete(b.id);
  await localDb.backlog.delete(taskId).catch(() => undefined);
}

/** Clear queued sync ops — used on re-link so stale patches from another account stop 403-looping. */
export async function clearSyncOutbox() {
  await localDb.outbox.clear();
  emit();
}

/**
 * After signing in / linking a device: drop stale outbox, pull this account's data, then flush.
 * Prevents patch 403 loops from leftover edits owned by a previous identity.
 */
export async function syncAfterDeviceLink() {
  await clearSyncOutbox();
  if (canSyncRemote()) {
    await pullFromServer();
    await flushOutbox();
  }
}
export async function saveAndSync() {
  if (canSyncRemote()) {
    // Remap offline workspace ids before attempting creates (prevents 403).
    await pullFromServer();
  }
  await flushOutbox();
  try {
    const { runLocalScheduler } = await import("./scheduler");
    await runLocalScheduler();
  } catch {
    // packing optional
  }
  if (canSyncRemote()) {
    await pullFromServer();
    await flushOutbox();
    // Remote packer is expensive on Workers — fire-and-forget, never block edits.
    void apiFetch("/api/schedule/run", { method: "POST" }).catch(() => undefined);
  }
}

export async function bootLocalSync() {
  try {
    emit();
    await repo.ensureOfflineWorkspace();
    if (canSyncRemote()) {
      // Pull first so offline `local-workspace` ids remap before create flush (403 otherwise).
      await pullFromServer();
      await flushOutbox();
      await pullFromServer();
      await flushOutbox();
    } else {
      setStatus("idle");
    }
  } catch (e) {
    console.error("bootLocalSync failed", e);
    setStatus("error", e instanceof Error ? e.message : "boot failed");
  }
}

export function todayWindow() {
  const now = new Date();
  return { from: startOfDay(now), to: endOfDay(now) };
}

// silence unused in some builds
void apiUrl;
