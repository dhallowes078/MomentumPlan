import { NextResponse } from "next/server";
import { requireUser, jsonError } from "@/lib/api";
import { prisma } from "@/lib/db";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ token: string }> }
) {
  const { userId, error, session } = await requireUser();
  if (error) return error;
  const { token } = await ctx.params;

  const invite = await prisma.workspaceInvite.findUnique({ where: { token } });
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
    return jsonError("Invite invalid or expired", 404);
  }

  const email = session.user?.email?.toLowerCase();
  if (!email || email !== invite.email.toLowerCase()) {
    return jsonError("Sign in with the invited email address", 403);
  }

  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: { workspaceId: invite.workspaceId, userId },
    },
    create: {
      workspaceId: invite.workspaceId,
      userId,
      role: invite.role,
    },
    update: { role: invite.role },
  });
  await prisma.workspaceInvite.update({
    where: { id: invite.id },
    data: { acceptedAt: new Date() },
  });

  return NextResponse.json({ ok: true, workspaceId: invite.workspaceId });
}
