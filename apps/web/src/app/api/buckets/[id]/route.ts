import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireUser, jsonError } from "@/lib/api";
import { assertWorkspaceAccess } from "@/lib/workspace";
import { prisma } from "@/lib/db";
import { parseDayHours, serializeDayHours } from "@/lib/day-hours";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { userId, error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;

  const existing = await prisma.bucket.findUnique({ where: { id } });
  if (!existing) return jsonError("Not found", 404);

  try {
    await assertWorkspaceAccess(userId, existing.workspaceId);
  } catch {
    return jsonError("Forbidden", 403);
  }

  const body = await req.json();
  const clear = body.clearSchedule === true;
  let dayHoursUpdate: Prisma.InputJsonValue | typeof Prisma.DbNull | undefined;
  if (clear || body.dayHours === null) {
    dayHoursUpdate = Prisma.DbNull;
  } else if (body.dayHours && typeof body.dayHours === "object") {
    const serialized = serializeDayHours(parseDayHours(body.dayHours));
    dayHoursUpdate =
      serialized === null ? Prisma.DbNull : (serialized as Prisma.InputJsonValue);
  }

  const bucket = await prisma.bucket.update({
    where: { id },
    data: {
      ...(typeof body.name === "string" && body.name.trim()
        ? { name: body.name.trim() }
        : {}),
      ...(typeof body.color === "string" ? { color: body.color } : {}),
      ...(typeof body.position === "number" ? { position: body.position } : {}),
      ...(clear
        ? {
            workDays: Prisma.DbNull,
            startMinutes: null,
            endMinutes: null,
            breakStartMinutes: null,
            breakEndMinutes: null,
            dayHours: Prisma.DbNull,
          }
        : {
            ...(Array.isArray(body.workDays) ? { workDays: body.workDays } : {}),
            ...(body.startMinutes === null || typeof body.startMinutes === "number"
              ? { startMinutes: body.startMinutes }
              : {}),
            ...(body.endMinutes === null || typeof body.endMinutes === "number"
              ? { endMinutes: body.endMinutes }
              : {}),
            ...(body.breakStartMinutes === null || typeof body.breakStartMinutes === "number"
              ? { breakStartMinutes: body.breakStartMinutes }
              : {}),
            ...(body.breakEndMinutes === null || typeof body.breakEndMinutes === "number"
              ? { breakEndMinutes: body.breakEndMinutes }
              : {}),
            ...(dayHoursUpdate !== undefined ? { dayHours: dayHoursUpdate } : {}),
          }),
    },
  });

  return NextResponse.json({ bucket });
}
