import { NextResponse } from "next/server";
import { addDays, startOfDay } from "date-fns";
import { requireUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { isMomentumEvent, listCalendarEvents } from "@/lib/graph";

export async function GET(req: Request) {
  const { userId, error } = await requireUser();
  if (error) return error;

  const url = new URL(req.url);
  const days = Number(url.searchParams.get("days") ?? "7");
  const from = startOfDay(new Date());
  const to = addDays(from, Math.min(Math.max(days, 1), 31));

  const blocks = await prisma.scheduleBlock.findMany({
    where: {
      userId,
      start: { lt: to },
      end: { gt: from },
    },
    include: {
      task: {
        select: {
          id: true,
          title: true,
          priority: true,
          atRisk: true,
          status: true,
          estimateMinutes: true,
          bucket: { select: { name: true, color: true } },
        },
      },
    },
    orderBy: { start: "asc" },
  });

  let meetings: Array<{
    id: string;
    subject: string;
    start: string;
    end: string;
    isMomentum: boolean;
  }> = [];

  try {
    const events = await listCalendarEvents(userId, from, to);
    meetings = events.map((e) => ({
      id: e.id,
      subject: e.subject,
      start: e.start.dateTime.endsWith("Z") ? e.start.dateTime : e.start.dateTime + "Z",
      end: e.end.dateTime.endsWith("Z") ? e.end.dateTime : e.end.dateTime + "Z",
      isMomentum: isMomentumEvent(e),
    }));
  } catch {
    // Outlook not connected yet
  }

  const conn = await prisma.calendarConnection.findUnique({ where: { userId } });

  return NextResponse.json({
    from: from.toISOString(),
    to: to.toISOString(),
    blocks,
    meetings,
    outlookConnected: Boolean(conn?.refreshToken || conn?.accessToken),
    lastSyncedAt: conn?.lastSyncedAt ?? null,
  });
}
