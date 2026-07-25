import { NextResponse } from "next/server";
import { requireUser, jsonError } from "@/lib/api";
import { assertWorkspaceAccess } from "@/lib/workspace";
import { prisma } from "@/lib/db";
import { storeFile, getFileUrl } from "@/lib/storage";

export async function POST(
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

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return jsonError("file required");
  if (!file.type.startsWith("image/")) return jsonError("Image required");

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length > 8 * 1024 * 1024) return jsonError("Max 8MB");

  const { storageKey } = await storeFile(file.name, file.type || "image/png", buf);

  const updated = await prisma.task.update({
    where: { id },
    data: {
      headerImageKey: storageKey,
      events: {
        create: {
          type: "HEADER_UPDATED",
          actorId: userId,
          payload: { headerImageKey: storageKey },
        },
      },
    },
  });

  const url = await getFileUrl(storageKey);
  return NextResponse.json({
    headerImageKey: updated.headerImageKey,
    headerImageUrl: url,
  });
}
