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

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length > 10 * 1024 * 1024) return jsonError("Max 10MB");

  const { storageKey } = await storeFile(file.name, file.type || "application/octet-stream", buf);

  const attachment = await prisma.attachment.create({
    data: {
      taskId: id,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: buf.length,
      storageKey,
      uploadedById: userId,
    },
  });

  await prisma.taskEvent.create({
    data: {
      taskId: id,
      actorId: userId,
      type: "ATTACHMENT_ADDED",
      payload: { attachmentId: attachment.id, fileName: file.name },
    },
  });

  const url = await getFileUrl(storageKey);
  return NextResponse.json({ attachment: { ...attachment, url } }, { status: 201 });
}
