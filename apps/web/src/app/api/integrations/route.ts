import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { googleAuthConfigured, microsoftAuthConfigured } from "@/lib/runtime-env";

export async function GET() {
  const { userId, error } = await requireUser();
  if (error) return error;

  const calendar = await prisma.calendarConnection.findUnique({
    where: { userId },
    select: { id: true, expiresAt: true, updatedAt: true },
  });

  return NextResponse.json({
    microsoftAuthConfigured: microsoftAuthConfigured(),
    googleAuthConfigured: googleAuthConfigured(),
    outlookCalendar: calendar
      ? { connected: true, updatedAt: calendar.updatedAt }
      : { connected: false },
  });
}
