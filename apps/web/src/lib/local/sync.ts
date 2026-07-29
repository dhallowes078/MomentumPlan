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
    if (detail?.workspace) {
      workspaces.push({
        id: detail.workspace.id,
        name: detail.workspace.name,
        buckets: (detail.workspace.buckets ?? []).map((b) => ({
          ...b,
          dayHours: parseDayHours(b.dayHours),
        })),
        members: (detail.workspace.members ?? []).map((m) => m.user),
      });
    } else {
      workspaces.push({ id: w.id, name: w.name, buckets: [], members: [] });
    }
  }
  await localDb.workspaces.clear();
  await localDb.workspaces.bulkPut(workspaces);

  const pendingCreates = await localDb.tasks.filter((t) => Boolean(t._localOnly)).toArray();
  const pendingIds = new Set(pendingCreates.map((t) => t.id));

  for (const ws of workspaces) {
    const data = await safeJson<{ tasks: Record<string, unknown>[] }>(
      `/api/tasks?${new URLSearchParams({ workspaceId: ws.id })}`
    );
    if (!data?.tasks) continue;
    const serverTasks = data.tasks.map(normalizeTask);
    const removedIds: string[] = [];
    await localDb.transaction("rw", localDb.tasks, localDb.scheduleBlocks, async () => {
      const existing = await localDb.tasks.where("workspaceId").equals(ws.id).toArray();
      for (const t of existing) {
        if (!pendingIds.has(t.id) && !serverTasks.some((s) => s.id === t.id)) {
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
    await repo.replaceSchedule(
      (cal.blocks ?? []).map((b) => ({
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
    await repo.replaceSchedule(
      today.blocks.map((b) => ({
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
  const pending = await localDb.outbox.orderBy("createdAt").toArray();
  for (const item of pending) {
    if (item.op.type !== "runScheduler") continue;
    try {
      const { runLocalScheduler } = await import("./scheduler");
      await runLocalScheduler();
      if (canSyncRemote() && (typeof navigator === "undefined" || navigator.onLine)) {
        await apiFetch("/api/schedule/run", { method: "POST" }).catch(() => undefined);
      }
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
    const items = await localDb.outbox.orderBy("createdAt").toArray();
    for (const item of items) {
      try {
        const op = item.op;
        if (op.type === "createTask") {
          const res = await apiFetch("/api/tasks", {
            method: "POST",
            body: JSON.stringify(op.body),
          });
          if (!res.ok) throw new Error(`create ${res.status}`);
          const data = await res.json();
          const serverId = data.task?.id as string;
          if (serverId) {
            const local = await localDb.tasks.get(op.localId);
            if (local) {
              await localDb.tasks.delete(op.localId);
              await localDb.tasks.put({
                ...local,
                id: serverId,
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
          const res = await apiFetch(`/api/tasks/${op.taskId}`, {
            method: "PATCH",
            body: JSON.stringify(op.body),
          });
          if (!res.ok) throw new Error(`patch ${res.status}`);
        } else if (op.type === "deleteTask") {
          const res = await apiFetch(`/api/tasks/${op.taskId}`, { method: "DELETE" });
          // 404 = already gone on server — treat as success.
          if (!res.ok && res.status !== 404) throw new Error(`delete ${res.status}`);
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
          // Should already be drained above; keep as safety net.
          const { runLocalScheduler } = await import("./scheduler");
          await runLocalScheduler();
          await apiFetch("/api/schedule/run", { method: "POST" }).catch(() => undefined);
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

/** Push local outbox, pull server state, then push again (e.g. after ID remap). */
export async function saveAndSync() {
  await flushOutbox();
  if (canSyncRemote()) {
    await pullFromServer();
    await flushOutbox();
  }
}

export async function bootLocalSync() {
  try {
    emit();
    await repo.ensureOfflineWorkspace();
    if (canSyncRemote()) {
      // Push local prefs/theme (and other outbox ops) before pull so a
      // stale server snapshot does not wipe appearance on boot.
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
