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
  const text = String(body.body ?? "").trim();
  if (!text) return jsonError("Comment body required");

  const comment = await prisma.comment.create({
    data: { taskId: id, authorId: userId, body: text },
    include: { author: { select: { id: true, name: true, email: true, image: true } } },
  });

  await prisma.taskEvent.create({
    data: { taskId: id, actorId: userId, type: "COMMENTED", payload: { commentId: comment.id } },
  });

  return NextResponse.json({ comment }, { status: 201 });
}
