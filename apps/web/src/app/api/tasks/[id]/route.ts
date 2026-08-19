import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { requireUser, jsonError } from "@/lib/api";
import { assertWorkspaceAccess } from "@/lib/workspace";
import { prisma } from "@/lib/db";
import { runSchedulerForUser } from "@/lib/scheduler-service";
import { getFileUrl } from "@/lib/storage";
import {
  buildNextOccurrenceFields,
  shouldCreateNextOccurrence,
} from "@/lib/recurrence";
import { runInBackground } from "@/lib/background";

const updateSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  notes: z.string().max(50_000).nullable().optional(),
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
  headerImageKey: z.string().nullable().optional(),
  emoji: z.string().max(8).nullable().optional(),
  mentionIds: z.array(z.string()).optional(),
  isRecurring: z.boolean().optional(),
  recurFreq: z.enum(["DAILY", "WEEKLY", "MONTHLY"]).nullable().optional(),
  recurInterval: z.number().int().min(1).max(52).optional(),
  recurByWeekdays: z.array(z.number().int().min(0).max(6)).nullable().optional(),
  recurEndsAt: z.string().datetime().nullable().optional(),
  recurCount: z.number().int().min(1).max(365).nullable().optional(),
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
      checklistItems: { orderBy: { position: "asc" } },
      mentions: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
      comments: {
        include: {
          author: {
            select: { id: true, name: true, email: true, image: true, color: true },
          },
        },
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

  const headerImageUrl = task.headerImageKey
    ? await getFileUrl(task.headerImageKey)
    : null;

  const [attachments, workspace] = await Promise.all([
    Promise.all(
      task.attachments
        .filter((a) => a.storageKey !== task.headerImageKey)
        .map(async (a) => ({
          ...a,
          url: await getFileUrl(a.storageKey),
        }))
    ),
    prisma.workspace.findUnique({
      where: { id: task.workspaceId },
      select: {
        buckets: { orderBy: { position: "asc" } },
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
                color: true,
              },
            },
          },
        },
      },
    }),
  ]);

  return NextResponse.json({
    task: {
      ...task,
      headerImageUrl,
      attachments,
    },
    workspace: workspace
      ? {
          buckets: workspace.buckets,
          members: workspace.members.map((m) => m.user),
        }
      : { buckets: [], members: [] },
  });
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

  if (data.mentionIds) {
    await prisma.taskMention.deleteMany({ where: { taskId: id } });
    if (data.mentionIds.length) {
      await prisma.taskMention.createMany({
        data: data.mentionIds.map((mentionUserId) => ({
          taskId: id,
          userId: mentionUserId,
        })),
      });
      await prisma.taskEvent.create({
        data: {
          taskId: id,
          actorId: userId,
          type: "MENTIONED",
          payload: { mentionIds: data.mentionIds },
        },
      });
    }
  }

  const { mentionIds: _mentions, ...rest } = data;

  const eventCreate = becomingDone
    ? { type: "COMPLETED" as const, actorId: userId }
    : reopening
      ? { type: "REOPENED" as const, actorId: userId }
      : rest.assigneeId && rest.assigneeId !== existing.assigneeId
        ? {
            type: "ASSIGNED" as const,
            actorId: userId,
            payload: { assigneeId: rest.assigneeId },
          }
        : Object.keys(rest).length
          ? {
              type: ("headerImageKey" in rest ? "HEADER_UPDATED" : "UPDATED") as
                | "HEADER_UPDATED"
                | "UPDATED",
              actorId: userId,
              payload: rest,
            }
          : null;

  const task = await prisma.task.update({
    where: { id },
    data: {
      ...("title" in rest ? { title: rest.title } : {}),
      ...("notes" in rest ? { notes: rest.notes } : {}),
      ...("priority" in rest ? { priority: rest.priority } : {}),
      ...("estimateMinutes" in rest ? { estimateMinutes: rest.estimateMinutes } : {}),
      ...("dueAt" in rest
        ? { dueAt: rest.dueAt ? new Date(rest.dueAt) : null }
        : {}),
      ...("bucketId" in rest ? { bucketId: rest.bucketId } : {}),
      ...("assigneeId" in rest ? { assigneeId: rest.assigneeId } : {}),
      ...("status" in rest ? { status: rest.status } : {}),
      ...("locked" in rest ? { locked: rest.locked } : {}),
      ...("allowSplit" in rest ? { allowSplit: rest.allowSplit } : {}),
      ...("scheduledStart" in rest
        ? { scheduledStart: rest.scheduledStart ? new Date(rest.scheduledStart) : null }
        : {}),
      ...("scheduledEnd" in rest
        ? { scheduledEnd: rest.scheduledEnd ? new Date(rest.scheduledEnd) : null }
        : {}),
      // Manual plan edits reset the "original" baseline so traffic lights
      // only flag system pushes after a missed slot.
      ...(rest.scheduledStart || rest.scheduledEnd || rest.locked === true
        ? {
            originalScheduledStart: rest.scheduledStart
              ? new Date(rest.scheduledStart)
              : existing.scheduledStart,
            originalScheduledEnd: rest.scheduledEnd
              ? new Date(rest.scheduledEnd)
              : existing.scheduledEnd,
          }
        : {}),
      ...("headerImageKey" in rest ? { headerImageKey: rest.headerImageKey } : {}),
      ...("emoji" in rest ? { emoji: rest.emoji } : {}),
      ...("isRecurring" in rest ? { isRecurring: rest.isRecurring } : {}),
      ...("recurFreq" in rest ? { recurFreq: rest.recurFreq } : {}),
      ...("recurInterval" in rest ? { recurInterval: rest.recurInterval } : {}),
      ...("recurByWeekdays" in rest ? { recurByWeekdays: rest.recurByWeekdays } : {}),
      ...("recurEndsAt" in rest
        ? { recurEndsAt: rest.recurEndsAt ? new Date(rest.recurEndsAt) : null }
        : {}),
      ...("recurCount" in rest ? { recurCount: rest.recurCount } : {}),
      completedAt: becomingDone
        ? new Date()
        : reopening
          ? null
          : undefined,
      ...(reopening
        ? {
            originalScheduledStart: null,
            originalScheduledEnd: null,
            scheduledStart: null,
            scheduledEnd: null,
          }
        : {}),
      ...(eventCreate ? { events: { create: eventCreate } } : {}),
    } as Prisma.TaskUncheckedUpdateInput,
    include: {
      links: true,
      bucket: true,
      assignee: { select: { id: true, name: true, email: true, image: true } },
      checklistItems: { orderBy: { position: "asc" } },
      mentions: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
    },
  });

  if (becomingDone) {
    const source = await prisma.task.findUnique({
      where: { id },
      include: { checklistItems: true, links: true, mentions: true },
    });
    if (
      source &&
      shouldCreateNextOccurrence({
        isRecurring: source.isRecurring,
        recurFreq: source.recurFreq,
        recurInterval: source.recurInterval,
        recurByWeekdays: Array.isArray(source.recurByWeekdays)
          ? (source.recurByWeekdays as number[])
          : null,
        recurEndsAt: source.recurEndsAt,
        recurCount: source.recurCount,
        recurOccurrencesDone: source.recurOccurrencesDone,
        dueAt: source.dueAt,
        scheduledStart: source.scheduledStart,
        scheduledEnd: source.scheduledEnd,
        locked: source.locked,
      })
    ) {
      const next = buildNextOccurrenceFields({
        id: source.id,
        isRecurring: source.isRecurring,
        recurFreq: source.recurFreq,
        recurInterval: source.recurInterval,
        recurByWeekdays: Array.isArray(source.recurByWeekdays)
          ? (source.recurByWeekdays as number[])
          : null,
        recurEndsAt: source.recurEndsAt,
        recurCount: source.recurCount,
        recurOccurrencesDone: source.recurOccurrencesDone,
        dueAt: source.dueAt,
        scheduledStart: source.scheduledStart,
        scheduledEnd: source.scheduledEnd,
        locked: source.locked,
      });
      await prisma.task.create({
        data: {
          workspaceId: source.workspaceId,
          title: source.title,
          notes: source.notes,
          priority: source.priority,
          estimateMinutes: source.estimateMinutes,
          bucketId: source.bucketId,
          headerImageKey: source.headerImageKey,
          assigneeId: source.assigneeId,
          createdById: source.createdById,
          allowSplit: next.locked ? false : source.allowSplit,
          locked: next.locked,
          scheduledStart: next.scheduledStart,
          scheduledEnd: next.scheduledEnd,
          isRecurring: true,
          recurFreq: source.recurFreq,
          recurInterval: source.recurInterval,
          recurByWeekdays: source.recurByWeekdays ?? undefined,
          recurEndsAt: source.recurEndsAt,
          recurCount: source.recurCount,
          recurOccurrencesDone: next.recurOccurrencesDone,
          recurParentId: next.recurParentId,
          templateId: source.templateId,
          dueAt: next.dueAt,
          checklistItems: source.checklistItems.length
            ? {
                create: source.checklistItems.map((c) => ({
                  text: c.text,
                  done: false,
                  position: c.position,
                })),
              }
            : undefined,
          links: source.links.length
            ? { create: source.links.map((l) => ({ url: l.url, title: l.title })) }
            : undefined,
          mentions: source.mentions.length
            ? { create: source.mentions.map((m) => ({ userId: m.userId })) }
            : undefined,
          events: {
            create: {
              type: "CREATED",
              actorId: userId,
              payload: { fromRecurrence: source.id },
            },
          },
        },
      });
    }
  }

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
  if (!existing) return NextResponse.json({ ok: true }); // already gone
  try {
    await assertWorkspaceAccess(userId, existing.workspaceId);
  } catch {
    return jsonError("Forbidden", 403);
  }

  try {
    // D1 / Prisma often fails on parent delete when child rows remain — clear
    // dependents explicitly instead of relying on SQL CASCADE alone.
    await prisma.scheduleBlock.deleteMany({ where: { taskId: id } });
    await prisma.checklistItem.deleteMany({ where: { taskId: id } });
    await prisma.taskMention.deleteMany({ where: { taskId: id } });
    await prisma.taskLink.deleteMany({ where: { taskId: id } });
    await prisma.attachment.deleteMany({ where: { taskId: id } });
    await prisma.comment.deleteMany({ where: { taskId: id } });
    await prisma.taskEvent.deleteMany({ where: { taskId: id } });
    await prisma.task.delete({ where: { id } });
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code: unknown }).code)
        : "";
    // P2025 = record already deleted
    if (code === "P2025") return NextResponse.json({ ok: true });
    console.error("[tasks DELETE]", id, err);
    return jsonError(
      err instanceof Error ? `Delete failed: ${err.message}` : "Delete failed",
      500
    );
  }

  runInBackground(runSchedulerForUser(userId));
  return NextResponse.json({ ok: true });
}
