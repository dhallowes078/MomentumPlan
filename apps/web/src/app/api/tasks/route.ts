import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, jsonError } from "@/lib/api";
import { assertWorkspaceAccess } from "@/lib/workspace";
import { prisma } from "@/lib/db";
import { runSchedulerForUser } from "@/lib/scheduler-service";
import { getFileUrl } from "@/lib/storage";
import { runInBackground } from "@/lib/background";

const createSchema = z.object({
  workspaceId: z.string().min(1),
  title: z.string().min(1).max(300),
  notes: z.string().optional().nullable(),
  priority: z.number().int().min(1).max(5).optional(),
  estimateMinutes: z.number().int().min(5).max(8 * 60).optional(),
  dueAt: z.string().datetime().optional().nullable(),
  bucketId: z.string().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  emoji: z.string().max(8).nullable().optional(),
  links: z.array(z.object({ url: z.string().url(), title: z.string().optional() })).optional(),
  locked: z.boolean().optional(),
  allowSplit: z.boolean().optional(),
  scheduledStart: z.string().datetime().optional().nullable(),
  scheduledEnd: z.string().datetime().optional().nullable(),
  isRecurring: z.boolean().optional(),
  recurFreq: z.enum(["DAILY", "WEEKLY", "MONTHLY"]).nullable().optional(),
  recurInterval: z.number().int().min(1).max(52).optional(),
  recurByWeekdays: z.array(z.number().int().min(0).max(6)).optional(),
  recurEndsAt: z.string().datetime().nullable().optional(),
  recurCount: z.number().int().min(1).max(365).nullable().optional(),
  templateId: z.string().nullable().optional(),
});

export async function GET(req: Request) {
  const { userId, error } = await requireUser();
  if (error) return error;

  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspaceId");
  if (!workspaceId) return jsonError("workspaceId required");

  try {
    await assertWorkspaceAccess(userId, workspaceId);
  } catch {
    return jsonError("Forbidden", 403);
  }

  const status = url.searchParams.get("status");
  const bucketId = url.searchParams.get("bucketId");

  const tasks = await prisma.task.findMany({
    where: {
      workspaceId,
      ...(status ? { status: status as "TODO" | "IN_PROGRESS" | "DONE" | "CANCELLED" } : {}),
      ...(bucketId ? { bucketId } : {}),
    },
    include: {
      bucket: true,
      assignee: { select: { id: true, name: true, email: true, image: true, color: true } },
      links: true,
      _count: { select: { comments: true, attachments: true } },
    },
    orderBy: [{ priority: "desc" }, { dueAt: "asc" }, { createdAt: "asc" }],
  });

  const withHeaders = await Promise.all(
    tasks.map(async (task) => ({
      ...task,
      headerImageUrl: task.headerImageKey ? await getFileUrl(task.headerImageKey) : null,
    }))
  );

  return NextResponse.json({ tasks: withHeaders });
}

export async function POST(req: Request) {
  const { userId, error } = await requireUser();
  if (error) return error;

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);

  const data = parsed.data;
  try {
    await assertWorkspaceAccess(userId, data.workspaceId);
  } catch {
    return jsonError("Forbidden", 403);
  }

  const locked = data.locked ?? false;
  const scheduledStart = data.scheduledStart ? new Date(data.scheduledStart) : null;
  const scheduledEnd = data.scheduledEnd ? new Date(data.scheduledEnd) : null;

  const task = await prisma.task.create({
    data: {
      workspaceId: data.workspaceId,
      title: data.title,
      notes: data.notes ?? null,
      emoji: data.emoji ?? null,
      priority: data.priority ?? 3,
      estimateMinutes: data.estimateMinutes ?? 30,
      dueAt: data.dueAt ? new Date(data.dueAt) : null,
      bucketId: data.bucketId ?? null,
      assigneeId: data.assigneeId ?? userId,
      createdById: userId,
      locked,
      allowSplit: locked ? false : (data.allowSplit ?? true),
      scheduledStart,
      scheduledEnd,
      originalScheduledStart: scheduledStart,
      originalScheduledEnd: scheduledEnd,
      templateId: data.templateId ?? null,
      isRecurring: data.isRecurring ?? false,
      recurFreq: data.isRecurring ? data.recurFreq ?? "WEEKLY" : null,
      recurInterval: data.recurInterval ?? 1,
      recurByWeekdays: data.recurByWeekdays ?? undefined,
      recurEndsAt: data.recurEndsAt ? new Date(data.recurEndsAt) : null,
      recurCount: data.recurCount ?? null,
    },
  });

  // Flatten nested writes for D1 compatibility.
  if (data.links?.length) {
    for (const l of data.links) {
      await prisma.taskLink.create({
        data: { taskId: task.id, url: l.url, title: l.title },
      });
    }
  }
  await prisma.taskEvent.create({
    data: { taskId: task.id, type: "CREATED", actorId: userId },
  });

  const full = await prisma.task.findUnique({
    where: { id: task.id },
    include: { links: true, bucket: true, assignee: true },
  });

  // Fire-and-forget reschedule (waitUntil so it can finish after the response)
  runInBackground(runSchedulerForUser(userId));

  return NextResponse.json({ task: full }, { status: 201 });
}
