import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, jsonError } from "@/lib/api";
import { assertWorkspaceAccess } from "@/lib/workspace";
import { prisma } from "@/lib/db";

const itemSchema = z.object({
  id: z.string().optional(),
  text: z.string().min(1).max(500),
  done: z.boolean().optional(),
  position: z.number().int().optional(),
});

const schema = z.object({
  items: z.array(itemSchema),
});

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { userId, error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;

  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return jsonError("Not found", 404);
  try {
    await assertWorkspaceAccess(userId, task.workspaceId);
  } catch {
    return jsonError("Forbidden", 403);
  }

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);

  await prisma.$transaction([
    prisma.checklistItem.deleteMany({ where: { taskId: id } }),
    prisma.checklistItem.createMany({
      data: parsed.data.items.map((item, index) => ({
        taskId: id,
        text: item.text,
        done: item.done ?? false,
        position: item.position ?? index,
      })),
    }),
    prisma.taskEvent.create({
      data: {
        taskId: id,
        actorId: userId,
        type: "CHECKLIST_UPDATED",
        payload: {
          summary: `${parsed.data.items.length} items · ${parsed.data.items.filter((i) => i.done).length} done`,
        },
      },
    }),
  ]);

  const items = await prisma.checklistItem.findMany({
    where: { taskId: id },
    orderBy: { position: "asc" },
  });

  return NextResponse.json({ items });
}
