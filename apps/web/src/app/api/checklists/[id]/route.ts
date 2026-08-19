import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, jsonError } from "@/lib/api";
import { assertWorkspaceAccess } from "@/lib/workspace";
import { prisma } from "@/lib/db";

const itemSchema = z.object({
  id: z.string().optional(),
  text: z.string(),
  done: z.boolean().optional(),
  position: z.number().int().optional(),
});

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  items: z.array(itemSchema).optional(),
  position: z.number().int().optional(),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { userId, error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;

  const existing = await prisma.planChecklist.findUnique({ where: { id } });
  if (!existing) return jsonError("Not found", 404);

  try {
    await assertWorkspaceAccess(userId, existing.workspaceId);
  } catch {
    return jsonError("Forbidden", 403);
  }

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return jsonError("Invalid checklist");

  const checklist = await prisma.planChecklist.update({
    where: { id },
    data: {
      ...(parsed.data.title ? { title: parsed.data.title.trim() } : {}),
      ...(parsed.data.items ? { items: parsed.data.items as object } : {}),
      ...(typeof parsed.data.position === "number" ? { position: parsed.data.position } : {}),
    },
  });

  return NextResponse.json({ checklist });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { userId, error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;

  const existing = await prisma.planChecklist.findUnique({ where: { id } });
  if (!existing) return jsonError("Not found", 404);

  try {
    await assertWorkspaceAccess(userId, existing.workspaceId);
  } catch {
    return jsonError("Forbidden", 403);
  }

  await prisma.planChecklist.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
