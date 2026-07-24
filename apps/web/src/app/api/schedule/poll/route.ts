import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { prisma } from "@/lib/db";

/** Lightweight poll endpoint — client can call periodically to refresh schedule from Outlook. */
export async function POST() {
  const { userId, error } = await requireUser();
  if (error) return error;

  const conn = await prisma.calendarConnection.findUnique({ where: { userId } });
  const stale =
    !conn?.lastSyncedAt ||
    Date.now() - conn.lastSyncedAt.getTime() > 3 * 60 * 1000;

  return NextResponse.json({ shouldReschedule: stale });
}
