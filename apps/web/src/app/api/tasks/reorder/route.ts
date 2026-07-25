import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, jsonError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { runSchedulerForUser } from "@/lib/scheduler-service";

const schema = z.object({
  updates: z.array(
    z.object({
      id: z.string(),
      priority: z.number().int().min(1).max(5).optional(),
      position: z.number().int().optional(),
    })
  ),
});

export async function POST(req: Request) {
  const { userId, error } = await requireUser();
  if (error) return error;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);

  for (const update of parsed.data.updates) {
    const existing = await prisma.task.findUnique({ where: { id: update.id } });
    if (!existing) continue;
    await prisma.task.update({
      where: { id: update.id },
      data: {
        ...(update.priority != null ? { priority: update.priority } : {}),
        ...(update.position != null ? { position: update.position } : {}),
        // User-driven agenda reorder resets the planned baseline.
        originalScheduledStart: null,
        originalScheduledEnd: null,
        events: {
          create: {
            type: "UPDATED",
            actorId: userId,
            payload: {
              ...(update.priority != null ? { priority: update.priority } : {}),
              ...(update.position != null ? { position: update.position } : {}),
            },
          },
        },
      },
    });
  }

  void runSchedulerForUser(userId).catch(console.error);
  return NextResponse.json({ ok: true });
}
