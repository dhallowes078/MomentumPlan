import { NextResponse } from "next/server";
import { requireUser, jsonError } from "@/lib/api";
import { assertWorkspaceAccess } from "@/lib/workspace";
import { prisma } from "@/lib/db";

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
  const bucket = await prisma.bucket.update({
    where: { id },
    data: {
      ...(typeof body.name === "string" && body.name.trim()
        ? { name: body.name.trim() }
        : {}),
      ...(typeof body.color === "string" ? { color: body.color } : {}),
      ...(typeof body.position === "number" ? { position: body.position } : {}),
    },
  });

  return NextResponse.json({ bucket });
}
