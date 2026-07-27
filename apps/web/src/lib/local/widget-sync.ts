import { registerPlugin } from "@capacitor/core";
import { endOfDay, format, startOfDay } from "date-fns";
import type { LocalScheduleBlock } from "./db";
import { getTask, listTodayBlocks } from "./repo";
import { getDeviceToken, getSyncApiBase } from "@/lib/sync-api";

type WidgetTask = {
  id: string;
  title: string;
  meta: string;
  completed?: boolean;
};

type WidgetPayload = {
  current: WidgetTask | null;
  next: WidgetTask | null;
  updatedAt: string;
};

type MomentumWidgetPlugin = {
  update: (options: {
    payload: WidgetPayload;
    token?: string | null;
    apiBase?: string | null;
  }) => Promise<void>;
};

const MomentumWidget = registerPlugin<MomentumWidgetPlugin>("MomentumWidget");

function blockMeta(block: LocalScheduleBlock) {
  try {
    return `${format(new Date(block.start), "HH:mm")}–${format(new Date(block.end), "HH:mm")}`;
  } catch {
    return "";
  }
}

function toWidgetTask(block: LocalScheduleBlock): WidgetTask | null {
  const task = block.task;
  if (!task) return null;
  return {
    id: task.id,
    title: task.emoji ? `${task.emoji} ${task.title}` : task.title,
    meta: blockMeta(block),
    completed: Boolean(block.completed || task.status === "DONE"),
  };
}

async function hydrateBlocks(blocks: LocalScheduleBlock[]) {
  return Promise.all(
    blocks.map(async (block) => {
      if (block.task) return block;
      const task = await getTask(block.taskId);
      if (!task) return block;
      return {
        ...block,
        task: {
          id: task.id,
          title: task.title,
          priority: task.priority,
          atRisk: task.atRisk,
          estimateMinutes: task.estimateMinutes,
          status: task.status,
          emoji: task.emoji,
          bucket: task.bucket ?? null,
        },
      };
    })
  );
}

export function pickCurrentAndNext(blocks: LocalScheduleBlock[], now = new Date()) {
  const open = blocks
    .filter((b) => b.task && b.task.status !== "DONE" && b.task.status !== "CANCELLED" && !b.completed)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  const nowMs = now.getTime();
  const current =
    open.find((b) => {
      const start = new Date(b.start).getTime();
      const end = new Date(b.end).getTime();
      return start <= nowMs && nowMs < end;
    }) ?? open.find((b) => new Date(b.start).getTime() >= nowMs) ?? open[0] ?? null;

  const currentIndex = current ? open.indexOf(current) : -1;
  const next = currentIndex >= 0 ? open[currentIndex + 1] ?? null : null;

  return {
    current: current ? toWidgetTask(current) : null,
    next: next ? toWidgetTask(next) : null,
  };
}

/** Push current/next focus tasks to the Android home-screen widget (no-op on web). */
export async function syncHomeWidget(blocks?: LocalScheduleBlock[]) {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return;

    const now = new Date();
    const source = await hydrateBlocks(
      blocks ?? (await listTodayBlocks(startOfDay(now), endOfDay(now)))
    );
    const { current, next } = pickCurrentAndNext(source);
    const payload: WidgetPayload = {
      current,
      next,
      updatedAt: new Date().toISOString(),
    };
    await MomentumWidget.update({
      payload,
      token: getDeviceToken(),
      apiBase: getSyncApiBase() || null,
    });
  } catch {
    // Widget bridge is Android-only; ignore on web / missing plugin.
  }
}
