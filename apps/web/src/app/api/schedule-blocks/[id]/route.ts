import { NextResponse } from "next/server";
import { requireUser, jsonError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { runSchedulerForUser } from "@/lib/scheduler-service";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { userId, error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;

  const block = await prisma.scheduleBlock.findUnique({
    where: { id },
    include: { task: true },
  });
  if (!block || block.userId !== userId) return jsonError("Not found", 404);

  const body = await req.json();
  const completed = Boolean(body.completed);

  const updated = await prisma.scheduleBlock.update({
    where: { id },
    data: { completed },
  });

  await prisma.taskEvent.create({
    data: {
      taskId: block.taskId,
      actorId: userId,
      type: completed ? "CHUNK_COMPLETED" : "CHUNK_REOPENED",
      payload: {
        blockId: id,
        start: block.start.toISOString(),
        end: block.end.toISOString(),
      },
    },
  });

  const remaining = await prisma.scheduleBlock.count({
    where: { taskId: block.taskId, completed: false },
  });

  if (completed && remaining === 0) {
    await prisma.task.update({
      where: { id: block.taskId },
      data: { status: "DONE", completedAt: new Date() },
    });
    await prisma.taskEvent.create({
      data: {
        taskId: block.taskId,
        actorId: userId,
        type: "COMPLETED",
        payload: { via: "all_chunks" },
      },
    });
  } else if (!completed && block.task.status === "DONE") {
    await prisma.task.update({
      where: { id: block.taskId },
      data: { status: "TODO", completedAt: null },
    });
  }

  void runSchedulerForUser(userId).catch(console.error);
  return NextResponse.json({ block: updated });
}
