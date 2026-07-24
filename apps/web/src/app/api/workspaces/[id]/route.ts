import { NextResponse } from "next/server";
import { requireUser, jsonError } from "@/lib/api";
import { assertWorkspaceAccess } from "@/lib/workspace";
import { prisma } from "@/lib/db";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { userId, error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;

  try {
    await assertWorkspaceAccess(userId, id);
  } catch {
    return jsonError("Forbidden", 403);
  }

  const workspace = await prisma.workspace.findUnique({
    where: { id },
    include: {
      buckets: { orderBy: { position: "asc" } },
      members: { include: { user: { select: { id: true, name: true, email: true, image: true } } } },
      invites: { where: { acceptedAt: null }, orderBy: { createdAt: "desc" } },
    },
  });

  return NextResponse.json({ workspace });
}
