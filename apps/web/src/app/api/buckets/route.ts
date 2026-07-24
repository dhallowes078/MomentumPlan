import { NextResponse } from "next/server";
import { requireUser, jsonError } from "@/lib/api";
import { assertWorkspaceAccess } from "@/lib/workspace";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  const { userId, error } = await requireUser();
  if (error) return error;

  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspaceId");
  if (!workspaceId) return jsonError("workspaceId required");

  try {
    await assertWorkspaceAccess(userId, workspaceId);
  } catch {
    return jsonError("Forbidden", 403);
  }

  const buckets = await prisma.bucket.findMany({
    where: { workspaceId },
    orderBy: { position: "asc" },
  });

  return NextResponse.json({ buckets });
}

export async function POST(req: Request) {
  const { userId, error } = await requireUser();
  if (error) return error;

  const body = await req.json();
  const workspaceId = String(body.workspaceId ?? "");
  const name = String(body.name ?? "").trim();
  if (!workspaceId || !name) return jsonError("workspaceId and name required");

  try {
    await assertWorkspaceAccess(userId, workspaceId);
  } catch {
    return jsonError("Forbidden", 403);
  }

  const count = await prisma.bucket.count({ where: { workspaceId } });
  const bucket = await prisma.bucket.create({
    data: {
      workspaceId,
      name,
      color: body.color ?? "#3D6B4F",
      position: count,
    },
  });

  return NextResponse.json({ bucket });
}
