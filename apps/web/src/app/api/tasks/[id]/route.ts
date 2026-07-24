import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, jsonError } from "@/lib/api";
import { assertWorkspaceAccess } from "@/lib/workspace";
import { prisma } from "@/lib/db";
import { runSchedulerForUser } from "@/lib/scheduler-service";

const updateSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  notes: z.string().nullable().optional(),
  priority: z.number().int().min(1).max(5).optional(),
  estimateMinutes: z.number().int().min(5).max(8 * 60).optional(),
  dueAt: z.string().datetime().nullable().optional(),
  bucketId: z.string().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  status: z.enum(["TODO", "IN_PROGRESS", "DONE", "CANCELLED"]).optional(),
  locked: z.boolean().optional(),
  allowSplit: z.boolean().optional(),
  scheduledStart: z.string().datetime().nullable().optional(),
  scheduledEnd: z.string().datetime().nullable().optional(),
});

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { userId, error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;

  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      bucket: true,
      assignee: { select: { id: true, name: true, email: true, image: true } },
      links: true,
      attachments: true,
      comments: {
        include: { author: { select: { id: true, name: true, email: true, image: true } } },
        orderBy: { createdAt: "asc" },
      },
      events: {
        include: { actor: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "desc" },
        take: 50,
      },
      scheduleBlocks: { orderBy: { start: "asc" } },
    },
  });

  if (!task) return jsonError("Not found", 404);
  try {
    await assertWorkspaceAccess(userId, task.workspaceId);
  } catch {
    return jsonError("Forbidden", 403);
  }

  return NextResponse.json({ task });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { userId, error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;

  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing) return jsonError("Not found", 404);
  try {
    await assertWorkspaceAccess(userId, existing.workspaceId);
  } catch {
    return jsonError("Forbidden", 403);
  }

  const parsed = updateSchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);
  const data = parsed.data;

  const becomingDone = data.status === "DONE" && existing.status !== "DONE";
  const reopening =
    data.status && data.status !== "DONE" && existing.status === "DONE";

  const task = await prisma.task.update({
    where: { id },
    data: {
      ...("title" in data ? { title: data.title } : {}),
      ...("notes" in data ? { notes: data.notes } : {}),
      ...("priority" in data ? { priority: data.priority } : {}),
      ...("estimateMinutes" in data ? { estimateMinutes: data.estimateMinutes } : {}),
      ...("dueAt" in data
        ? { dueAt: data.dueAt ? new Date(data.dueAt) : null }
        : {}),
      ...("bucketId" in data ? { bucketId: data.bucketId } : {}),
      ...("assigneeId" in data ? { assigneeId: data.assigneeId } : {}),
      ...("status" in data ? { status: data.status } : {}),
      ...("locked" in data ? { locked: data.locked } : {}),
      ...("allowSplit" in data ? { allowSplit: data.allowSplit } : {}),
      ...("scheduledStart" in data
        ? { scheduledStart: data.scheduledStart ? new Date(data.scheduledStart) : null }
        : {}),
      ...("scheduledEnd" in data
        ? { scheduledEnd: data.scheduledEnd ? new Date(data.scheduledEnd) : null }
        : {}),
      completedAt: becomingDone
        ? new Date()
        : reopening
          ? null
          : undefined,
      events: {
        create: becomingDone
          ? { type: "COMPLETED", actorId: userId }
          : reopening
            ? { type: "REOPENED", actorId: userId }
            : data.assigneeId && data.assigneeId !== existing.assigneeId
              ? { type: "ASSIGNED", actorId: userId, payload: { assigneeId: data.assigneeId } }
              : { type: "UPDATED", actorId: userId, payload: data },
      },
    },
    include: {
      links: true,
      bucket: true,
      assignee: { select: { id: true, name: true, email: true, image: true } },
    },
  });

  void runSchedulerForUser(userId).catch(console.error);

  return NextResponse.json({ task });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { userId, error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;

  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing) return jsonError("Not found", 404);
  try {
    await assertWorkspaceAccess(userId, existing.workspaceId);
  } catch {
    return jsonError("Forbidden", 403);
  }

  await prisma.task.delete({ where: { id } });
  void runSchedulerForUser(userId).catch(console.error);
  return NextResponse.json({ ok: true });
}
