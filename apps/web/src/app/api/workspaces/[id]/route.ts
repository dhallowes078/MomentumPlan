import { NextResponse } from "next/server";
import { requireUser, jsonError } from "@/lib/api";
import { assertWorkspaceAccess } from "@/lib/workspace";
import { prisma } from "@/lib/db";
import { getFileUrl } from "@/lib/storage";

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
      members: {
        include: {
          user: {
            select: { id: true, name: true, email: true, image: true, color: true },
          },
        },
      },
      invites: { where: { acceptedAt: null }, orderBy: { createdAt: "desc" } },
    },
  });

  if (!workspace) return jsonError("Not found", 404);

  const members = await Promise.all(
    workspace.members.map(async (m) => {
      const image = m.user.image;
      const imageUrl =
        image && !image.startsWith("http") && !image.startsWith("data:")
          ? await getFileUrl(image)
          : image;
      return {
        ...m,
        user: { ...m.user, image: imageUrl },
      };
    })
  );

  return NextResponse.json({
    workspace: { ...workspace, members },
  });
}
