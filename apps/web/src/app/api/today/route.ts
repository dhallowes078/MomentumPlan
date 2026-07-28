import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { startOfDay, endOfDay } from "date-fns";

export async function GET() {
  const { userId, error } = await requireUser();
  if (error) return error;

  const now = new Date();
  const from = startOfDay(now);
  const to = endOfDay(now);

  // Do not run the packer on every Today fetch — it is CPU-heavy on Workers (Error 1102).
  // Reschedule via /api/schedule/run or the calendar Sync button instead.

  const blocks = await prisma.scheduleBlock.findMany({
    where: { userId, start: { lt: to }, end: { gt: from } },
    include: {
      task: {
        include: {
          bucket: true,
          links: true,
        },
      },
    },
    orderBy: { start: "asc" },
  });

  const memberships = await prisma.workspaceMember.findMany({
    where: { userId },
    select: { workspaceId: true },
  });

  const backlog = await prisma.task.findMany({
    where: {
      workspaceId: { in: memberships.map((m) => m.workspaceId) },
      status: { in: ["TODO", "IN_PROGRESS"] },
      scheduledStart: null,
      OR: [{ assigneeId: userId }, { assigneeId: null }],
    },
    include: { bucket: true },
    orderBy: [{ atRisk: "desc" }, { priority: "desc" }, { dueAt: "asc" }],
    take: 30,
  });

  const atRisk = await prisma.task.findMany({
    where: {
      workspaceId: { in: memberships.map((m) => m.workspaceId) },
      status: { in: ["TODO", "IN_PROGRESS"] },
      atRisk: true,
    },
    include: { bucket: true },
    orderBy: { dueAt: "asc" },
    take: 20,
  });

  return NextResponse.json({ blocks, backlog, atRisk });
}
