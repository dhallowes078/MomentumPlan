import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  const { userId, error } = await requireUser();
  if (error) return error;

  const url = new URL(req.url);
  const filter = url.searchParams.get("filter"); // onTime | pushed | overdue | null

  const memberships = await prisma.workspaceMember.findMany({
    where: { userId },
    select: { workspaceId: true },
  });
  const workspaceIds = memberships.map((m) => m.workspaceId);
  const now = new Date();

  const tasks = await prisma.task.findMany({
    where: {
      workspaceId: { in: workspaceIds },
      status: { in: ["TODO", "IN_PROGRESS"] },
      OR: [{ assigneeId: userId }, { assigneeId: null, createdById: userId }],
    },
    include: {
      bucket: { select: { id: true, name: true, color: true } },
    },
    orderBy: [{ priority: "desc" }, { dueAt: "asc" }],
  });

  const onTime: typeof tasks = [];
  const pushed: typeof tasks = [];
  const overdue: typeof tasks = [];

  for (const task of tasks) {
    // Overdue = past due date (deadline), not merely a user-edited plan.
    const isOverdue = Boolean(task.dueAt && task.dueAt < now);
    if (isOverdue) {
      overdue.push(task);
      continue;
    }

    // Pushed = missed the original planned slot (that end time already passed)
    // and the task is now scheduled later. Manual plan edits reset originals.
    const missedPlannedSlot = Boolean(
      task.originalScheduledEnd && task.originalScheduledEnd < now
    );
    const movedLater = Boolean(
      task.originalScheduledStart &&
        task.scheduledStart &&
        task.scheduledStart.getTime() > task.originalScheduledStart.getTime() + 60_000
    );
    if (missedPlannedSlot && movedLater) {
      pushed.push(task);
      continue;
    }
    onTime.push(task);
  }

  const payload = {
    onTime: onTime.length,
    pushed: pushed.length,
    overdue: overdue.length,
    total: tasks.length,
    tasks: {
      onTime,
      pushed,
      overdue,
    },
  };

  if (filter === "onTime" || filter === "pushed" || filter === "overdue") {
    return NextResponse.json({
      ...payload,
      list: payload.tasks[filter],
      filter,
    });
  }

  return NextResponse.json(payload);
}
