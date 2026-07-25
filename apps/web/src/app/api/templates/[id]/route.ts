import { NextResponse } from "next/server";
import { requireUser, jsonError } from "@/lib/api";
import { assertWorkspaceAccess } from "@/lib/workspace";
import { prisma } from "@/lib/db";
import { runSchedulerForUser } from "@/lib/scheduler-service";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { userId, error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;

  const template = await prisma.taskTemplate.findUnique({ where: { id } });
  if (!template) return jsonError("Not found", 404);
  try {
    await assertWorkspaceAccess(userId, template.workspaceId);
  } catch {
    return jsonError("Forbidden", 403);
  }

  const checklist = Array.isArray(template.checklistJson)
    ? (template.checklistJson as Array<{ text: string; done?: boolean }>)
    : [];
  const links = Array.isArray(template.linksJson)
    ? (template.linksJson as Array<{ url: string; title?: string }>)
    : [];

  const task = await prisma.task.create({
    data: {
      workspaceId: template.workspaceId,
      title: template.title,
      notes: template.notes,
      priority: template.priority,
      estimateMinutes: template.estimateMinutes,
      bucketId: template.bucketId,
      headerImageKey: template.headerImageKey,
      assigneeId: userId,
      createdById: userId,
      templateId: template.id,
      links: links.length
        ? { create: links.map((l) => ({ url: l.url, title: l.title })) }
        : undefined,
      checklistItems: checklist.length
        ? {
            create: checklist.map((c, i) => ({
              text: c.text,
              done: Boolean(c.done),
              position: i,
            })),
          }
        : undefined,
      events: { create: { type: "CREATED", actorId: userId, payload: { fromTemplate: id } } },
    },
  });

  void runSchedulerForUser(userId).catch(console.error);
  return NextResponse.json({ task }, { status: 201 });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { userId, error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;
  const template = await prisma.taskTemplate.findUnique({ where: { id } });
  if (!template) return jsonError("Not found", 404);
  try {
    await assertWorkspaceAccess(userId, template.workspaceId);
  } catch {
    return jsonError("Forbidden", 403);
  }
  await prisma.taskTemplate.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
