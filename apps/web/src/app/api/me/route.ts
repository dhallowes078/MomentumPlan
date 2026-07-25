import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, jsonError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { storeFile, getFileUrl } from "@/lib/storage";

export async function GET() {
  const { userId, error } = await requireUser();
  if (error) return error;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, image: true, color: true },
  });
  if (!user) return jsonError("Not found", 404);

  const imageUrl =
    user.image && !user.image.startsWith("http") && !user.image.startsWith("data:")
      ? await getFileUrl(user.image)
      : user.image;

  return NextResponse.json({ user: { ...user, imageUrl } });
}

const schema = z.object({
  name: z.string().min(1).max(120).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  image: z.string().nullable().optional(),
});

export async function PATCH(req: Request) {
  const { userId, error } = await requireUser();
  if (error) return error;

  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const name = form.get("name");
    const color = form.get("color");
    const file = form.get("avatar");

    const data: { name?: string; color?: string; image?: string } = {};
    if (typeof name === "string" && name.trim()) data.name = name.trim();
    if (typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color)) data.color = color;

    if (file instanceof File && file.size > 0) {
      const buf = Buffer.from(await file.arrayBuffer());
      if (buf.length > 5 * 1024 * 1024) return jsonError("Max 5MB avatar");
      const { storageKey } = await storeFile(
        file.name,
        file.type || "image/png",
        buf
      );
      data.image = storageKey;
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data,
      select: { id: true, name: true, email: true, image: true, color: true },
    });

    const imageUrl =
      user.image && !user.image.startsWith("http") && !user.image.startsWith("data:")
        ? await getFileUrl(user.image)
        : user.image;

    return NextResponse.json({ user: { ...user, imageUrl } });
  }

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);

  const user = await prisma.user.update({
    where: { id: userId },
    data: parsed.data,
    select: { id: true, name: true, email: true, image: true, color: true },
  });

  const imageUrl =
    user.image && !user.image.startsWith("http") && !user.image.startsWith("data:")
      ? await getFileUrl(user.image)
      : user.image;

  return NextResponse.json({ user: { ...user, imageUrl } });
}
