import { NextResponse } from "next/server";
import { requireUser, jsonError } from "@/lib/api";
import { assertWorkspaceAccess } from "@/lib/workspace";
import { prisma } from "@/lib/db";
import { addDays } from "date-fns";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { userId, error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;

  try {
    await assertWorkspaceAccess(userId, id, ["OWNER"]);
  } catch {
    return jsonError("Only owners can invite", 403);
  }

  const body = await req.json();
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!email) return jsonError("Email required");

  const invite = await prisma.workspaceInvite.create({
    data: {
      workspaceId: id,
      email,
      role: body.role === "OWNER" ? "OWNER" : "MEMBER",
      invitedById: userId,
      expiresAt: addDays(new Date(), 14),
    },
  });

  return NextResponse.json({ invite });
}

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

  const invites = await prisma.workspaceInvite.findMany({
    where: { workspaceId: id, acceptedAt: null },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ invites });
}
