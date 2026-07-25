import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { prisma } from "@/lib/db";

export async function GET() {
  const { userId, error } = await requireUser();
  if (error) return error;

  const calendar = await prisma.calendarConnection.findUnique({
    where: { userId },
    select: { id: true, expiresAt: true, updatedAt: true },
  });

  const microsoftAuthConfigured = Boolean(
    process.env.AUTH_MICROSOFT_ENTRA_ID_ID &&
      process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET
  );
  const googleAuthConfigured = Boolean(
    process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
  );

  return NextResponse.json({
    microsoftAuthConfigured,
    googleAuthConfigured,
    outlookCalendar: calendar
      ? { connected: true, updatedAt: calendar.updatedAt }
      : { connected: false },
  });
}
