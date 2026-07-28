"use client";

import type { LocalPrefs, LocalScheduleBlock } from "@/lib/local/db";
import * as repo from "@/lib/local/repo";
import { flushOutbox, pullFromServer } from "@/lib/local/sync";

const CHANNEL_ID = "momentum-tasks";
const START_BASE = 10_000;
const END_BASE = 20_000;
const ONGOING_BASE = 30_000;

async function getCapacitor() {
  if (typeof window === "undefined") return null;
  try {
    const { Capacitor } = await import("@capacitor/core");
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    return { Capacitor, LocalNotifications };
  } catch {
    return null;
  }
}

async function isNative() {
  const cap = await getCapacitor();
  return Boolean(cap?.Capacitor.isNativePlatform());
}

function inQuietHours(prefs: LocalPrefs, at: Date) {
  const start = prefs.quietHoursStart;
  const end = prefs.quietHoursEnd;
  if (start == null || end == null) return false;
  const mins = at.getHours() * 60 + at.getMinutes();
  if (start === end) return false;
  if (start < end) return mins >= start && mins < end;
  return mins >= start || mins < end;
}

function shiftOutOfQuiet(prefs: LocalPrefs, at: Date): Date {
  if (!inQuietHours(prefs, at)) return at;
  const end = prefs.quietHoursEnd ?? 0;
  const next = new Date(at);
  next.setHours(Math.floor(end / 60), end % 60, 0, 0);
  if (next <= at) next.setDate(next.getDate() + 1);
  return next;
}

function hashId(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return h;
}

async function ensureChannel() {
  const cap = await getCapacitor();
  if (!cap || !cap.Capacitor.isNativePlatform()) return;
  await cap.LocalNotifications.createChannel({
    id: CHANNEL_ID,
    name: "Task prompts",
    description: "Start and finish questions for scheduled tasks",
    importance: 5,
    visibility: 1,
    vibration: true,
  });
}

export async function requestNotificationPermission(): Promise<boolean> {
  const cap = await getCapacitor();
  if (cap?.Capacitor.isNativePlatform()) {
    const perm = await cap.LocalNotifications.requestPermissions();
    return perm.display === "granted";
  }
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "granted") return true;
  const result = await Notification.requestPermission();
  return result === "granted";
}

export async function clearTaskNotifications() {
  const cap = await getCapacitor();
  if (!cap?.Capacitor.isNativePlatform()) return;
  try {
    const pending = await cap.LocalNotifications.getPending();
    if (pending.notifications.length) {
      await cap.LocalNotifications.cancel({ notifications: pending.notifications });
    }
  } catch {
    // ignore
  }
}

let webTimers: number[] = [];

async function showWebNotification(title: string, body: string, tag?: string) {
  if (typeof window === "undefined") return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg?.active) {
      reg.active.postMessage({
        type: "show-notification",
        title,
        body,
        tag,
        url: "/today",
        renotify: true,
      });
      return;
    }
  } catch {
    // fall through
  }

  try {
    new Notification(title, { body, tag, icon: "/icon.svg" });
  } catch {
    // ignore
  }
}

function scheduleWebFallbacks(blocks: LocalScheduleBlock[], prefs: LocalPrefs) {
  if (typeof window === "undefined") return;
  for (const id of webTimers) window.clearTimeout(id);
  webTimers = [];
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

  const now = Date.now();
  // Browsers throttle long setTimeouts; keep a rolling window and refresh often.
  const MAX_AHEAD_MS = 6 * 60 * 60 * 1000;

  for (const b of blocks) {
    const title = b.task?.title ?? "Task";
    const startAt = shiftOutOfQuiet(prefs, new Date(b.start)).getTime();
    const endAt = shiftOutOfQuiet(prefs, new Date(b.end)).getTime();

    if (startAt > now && startAt - now < MAX_AHEAD_MS) {
      webTimers.push(
        window.setTimeout(() => {
          void showWebNotification(`Time for ${title}`, "Have you started? Open Momentum to update.", `start-${b.id}`);
        }, startAt - now)
      );
    } else if (startAt <= now && endAt > now && b.task?.status !== "IN_PROGRESS" && b.task?.status !== "DONE") {
      // Missed start — nudge once if the block is still underway.
      void showWebNotification(`Time for ${title}`, "Have you started? Open Momentum to update.", `start-late-${b.id}`);
    }

    if (endAt > now && endAt - now < MAX_AHEAD_MS) {
      webTimers.push(
        window.setTimeout(() => {
          void showWebNotification(`${title} ending`, "Finished? Open Momentum to update.", `end-${b.id}`);
        }, endAt - now)
      );
    }
  }
}

/** Reschedule start/end prompts from local schedule blocks. */
export async function rescheduleTaskNotifications() {
  if (typeof window === "undefined") return;
  const prefs = await repo.getPrefs();
  if (!prefs.notificationsEnabled) {
    await clearTaskNotifications();
    for (const id of webTimers) window.clearTimeout(id);
    webTimers = [];
    return;
  }

  const blocks = await repo.listScheduleBlocks();
  const open = blocks.filter((b) => !b.completed && b.task && b.task.status !== "DONE");
  const now = Date.now();
  const native = await isNative();

  if (native) {
    const cap = await getCapacitor();
    if (!cap) return;
    await ensureChannel();
    await clearTaskNotifications();
    const notifications: {
      id: number;
      title: string;
      body: string;
      schedule: { at: Date };
      channelId: string;
      extra: Record<string, string>;
      actionTypeId: string;
      ongoing?: boolean;
      autoCancel?: boolean;
    }[] = [];

    for (const b of open) {
      const startAt = shiftOutOfQuiet(prefs, new Date(b.start));
      const endAt = shiftOutOfQuiet(prefs, new Date(b.end));
      const title = b.task?.title ?? "Task";
      const hash = Math.abs(hashId(b.id)) % 9000;

      if (startAt.getTime() > now + 5_000) {
        notifications.push({
          id: START_BASE + hash,
          title: `Time for ${title}`,
          body: "Have you started?",
          schedule: { at: startAt },
          channelId: CHANNEL_ID,
          extra: { kind: "start", taskId: b.taskId, blockId: b.id },
          actionTypeId: "TASK_START",
          autoCancel: true,
        });
      }

      if (endAt.getTime() > now + 5_000) {
        notifications.push({
          id: END_BASE + hash,
          title: `${title} ending`,
          body: "Finished?",
          schedule: { at: endAt },
          channelId: CHANNEL_ID,
          extra: { kind: "end", taskId: b.taskId, blockId: b.id },
          actionTypeId: "TASK_END",
          autoCancel: true,
        });
      }

      if (b.task?.status === "IN_PROGRESS") {
        notifications.push({
          id: ONGOING_BASE + hash,
          title: `Focus: ${title}`,
          body: "Working on this now",
          schedule: { at: new Date(now + 1000) },
          channelId: CHANNEL_ID,
          extra: { kind: "ongoing", taskId: b.taskId, blockId: b.id },
          actionTypeId: "TASK_ONGOING",
          ongoing: true,
          autoCancel: false,
        });
      }
    }

    if (notifications.length) {
      await cap.LocalNotifications.schedule({ notifications });
    }
    return;
  }

  scheduleWebFallbacks(open, prefs);
}

let actionsRegistered = false;
let webRefreshTimer: number | null = null;

export async function registerNotificationActions() {
  if (typeof window === "undefined" || actionsRegistered) return;
  const cap = await getCapacitor();
  if (!cap?.Capacitor.isNativePlatform()) return;
  actionsRegistered = true;

  await cap.LocalNotifications.registerActionTypes({
    types: [
      {
        id: "TASK_START",
        actions: [
          { id: "started", title: "Started" },
          { id: "snooze", title: "Snooze" },
          { id: "skip", title: "Skip", destructive: true },
        ],
      },
      {
        id: "TASK_END",
        actions: [
          { id: "finished", title: "Finished" },
          { id: "need_more", title: "Need more time" },
          { id: "still_going", title: "Still going" },
        ],
      },
      {
        id: "TASK_ONGOING",
        actions: [
          { id: "finished", title: "Finished" },
          { id: "pause", title: "Pause" },
        ],
      },
    ],
  });

  await cap.LocalNotifications.addListener("localNotificationActionPerformed", async (event) => {
    const actionId = event.actionId;
    const extra = (event.notification.extra ?? {}) as {
      kind?: string;
      taskId?: string;
      blockId?: string;
    };
    const taskId = extra.taskId;
    if (!taskId) return;

    if (actionId === "started" || actionId === "still_going") {
      await repo.patchLocalTask(taskId, { status: "IN_PROGRESS" }, { status: "IN_PROGRESS" });
    } else if (actionId === "finished") {
      await repo.patchLocalTask(
        taskId,
        { status: "DONE", completedAt: new Date().toISOString() },
        { status: "DONE" }
      );
    } else if (actionId === "pause" || actionId === "skip") {
      await repo.patchLocalTask(taskId, { status: "TODO" }, { status: "TODO" });
    } else if (actionId === "snooze") {
      const prefs = await repo.getPrefs();
      const mins = prefs.notificationSnoozeMinutes || 10;
      await cap.LocalNotifications.schedule({
        notifications: [
          {
            id: START_BASE + (Math.abs(hashId(taskId)) % 9000),
            title: event.notification.title ?? "Task reminder",
            body: "Have you started?",
            schedule: { at: new Date(Date.now() + mins * 60_000) },
            channelId: CHANNEL_ID,
            extra: { kind: "start", taskId, blockId: extra.blockId ?? "" },
            actionTypeId: "TASK_START",
          },
        ],
      });
      return;
    } else if (actionId === "need_more") {
      await repo.patchLocalTask(taskId, { status: "IN_PROGRESS" }, { status: "IN_PROGRESS" });
    }

    await flushOutbox();
    await pullFromServer();
    await rescheduleTaskNotifications();
  });
}

export async function initNotifications() {
  await registerNotificationActions();
  await rescheduleTaskNotifications();

  if (typeof window !== "undefined" && webRefreshTimer == null) {
    // Refresh web timers so long-horizon blocks still notify.
    webRefreshTimer = window.setInterval(() => {
      void rescheduleTaskNotifications();
    }, 15 * 60_000);
    window.addEventListener("focus", () => {
      void rescheduleTaskNotifications();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void rescheduleTaskNotifications();
    });
  }
}
