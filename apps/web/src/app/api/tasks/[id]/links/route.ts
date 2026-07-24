import { NextResponse } from "next/server";
import { requireUser, jsonError } from "@/lib/api";
import { assertWorkspaceAccess } from "@/lib/workspace";
import { prisma } from "@/lib/db";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { userId, error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;

  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return jsonError("Not found", 404);
  try {
    await assertWorkspaceAccess(userId, task.workspaceId);
  } catch {
    return jsonError("Forbidden", 403);
  }

  const body = await req.json();
  const url = String(body.url ?? "").trim();
  if (!url) return jsonError("url required");

  const link = await prisma.taskLink.create({
    data: { taskId: id, url, title: body.title ?? null },
  });

  await prisma.taskEvent.create({
    data: { taskId: id, actorId: userId, type: "LINK_ADDED", payload: { linkId: link.id, url } },
  });

  return NextResponse.json({ link }, { status: 201 });
}
