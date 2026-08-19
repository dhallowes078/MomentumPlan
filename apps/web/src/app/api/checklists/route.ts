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

const createSchema = z.object({
  workspaceId: z.string().min(1),
  title: z.string().min(1).max(200),
  items: z.array(itemSchema).optional(),
  position: z.number().int().optional(),
});

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

  const checklists = await prisma.planChecklist.findMany({
    where: { workspaceId },
    orderBy: [{ position: "asc" }, { updatedAt: "desc" }],
  });

  return NextResponse.json({ checklists });
}

export async function POST(req: Request) {
  const { userId, error } = await requireUser();
  if (error) return error;

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return jsonError("Invalid checklist");

  const { workspaceId, title, items, position } = parsed.data;
  try {
    await assertWorkspaceAccess(userId, workspaceId);
  } catch {
    return jsonError("Forbidden", 403);
  }

  const count = await prisma.planChecklist.count({ where: { workspaceId } });
  const checklist = await prisma.planChecklist.create({
    data: {
      workspaceId,
      title: title.trim(),
      items: (items ?? []) as object,
      position: position ?? count,
    },
  });

  return NextResponse.json({ checklist });
}
