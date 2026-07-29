import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireUser, jsonError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { runSchedulerForUser } from "@/lib/scheduler-service";
import { parseDayHours, serializeDayHours } from "@/lib/day-hours";

export async function GET() {
  const { userId, error } = await requireUser();
  if (error) return error;

  const prefs = await prisma.schedulePrefs.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });

  return NextResponse.json({ prefs });
}

const dayHoursSchema = z
  .record(
    z.string(),
    z.object({
      startMinutes: z.number().int().min(0).max(24 * 60 - 1),
      endMinutes: z.number().int().min(1).max(24 * 60),
      breakStartMinutes: z.number().int().nullable().optional(),
      breakEndMinutes: z.number().int().nullable().optional(),
    })
  )
  .nullable()
  .optional();

const schema = z.object({
  workDays: z.array(z.number().int().min(0).max(6)).optional(),
  startMinutes: z.number().int().min(0).max(24 * 60 - 1).optional(),
  endMinutes: z.number().int().min(1).max(24 * 60).optional(),
  breakStartMinutes: z.number().int().nullable().optional(),
  breakEndMinutes: z.number().int().nullable().optional(),
  dayHours: dayHoursSchema,
  planningDays: z.number().int().min(1).max(30).optional(),
  minChunkMinutes: z.number().int().min(5).max(120).optional(),
  bufferMinutes: z.number().int().min(0).max(60).optional(),
  timezone: z.string().optional(),
  tinyMinutes: z.number().int().min(5).max(8 * 60).optional(),
  smallMinutes: z.number().int().min(5).max(8 * 60).optional(),
  mediumMinutes: z.number().int().min(5).max(8 * 60).optional(),
  bigMinutes: z.number().int().min(5).max(8 * 60).optional(),
  themeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  darkMode: z.boolean().optional(),
  notificationsEnabled: z.boolean().optional(),
  notificationSnoozeMinutes: z.number().int().min(5).max(120).optional(),
  quietHoursStart: z.number().int().min(0).max(24 * 60 - 1).nullable().optional(),
  quietHoursEnd: z.number().int().min(0).max(24 * 60 - 1).nullable().optional(),
});

export async function PATCH(req: Request) {
  const { userId, error } = await requireUser();
  if (error) return error;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);

  const { dayHours, ...rest } = parsed.data;
  const serialized = dayHours !== undefined ? serializeDayHours(parseDayHours(dayHours)) : undefined;
  const data = {
    ...rest,
    ...(serialized !== undefined
      ? {
          dayHours:
            serialized === null
              ? Prisma.DbNull
              : (serialized as Prisma.InputJsonValue),
        }
      : {}),
  };

  const prefs = await prisma.schedulePrefs.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });

  void runSchedulerForUser(userId).catch(console.error);

  return NextResponse.json({ prefs });
}
