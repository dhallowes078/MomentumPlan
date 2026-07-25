import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, jsonError } from "@/lib/api";
import { assertWorkspaceAccess } from "@/lib/workspace";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  const { userId, error } = await requireUser();
  if (error) return error;
  const workspaceId = new URL(req.url).searchParams.get("workspaceId");
  if (!workspaceId) return jsonError("workspaceId required");
  try {
    await assertWorkspaceAccess(userId, workspaceId);
  } catch {
    return jsonError("Forbidden", 403);
  }

  const templates = await prisma.taskTemplate.findMany({
    where: { workspaceId },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({ templates });
}

const schema = z.object({
  workspaceId: z.string(),
  name: z.string().min(1).max(120),
  title: z.string().min(1).max(300),
  notes: z.string().nullable().optional(),
  priority: z.number().int().min(1).max(5).optional(),
  estimateMinutes: z.number().int().min(5).max(8 * 60).optional(),
  bucketId: z.string().nullable().optional(),
  headerImageKey: z.string().nullable().optional(),
  checklist: z
    .array(z.object({ text: z.string(), done: z.boolean().optional() }))
    .optional(),
  links: z.array(z.object({ url: z.string(), title: z.string().optional() })).optional(),
});

export async function POST(req: Request) {
  const { userId, error } = await requireUser();
  if (error) return error;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);

  try {
    await assertWorkspaceAccess(userId, parsed.data.workspaceId);
  } catch {
    return jsonError("Forbidden", 403);
  }

  const template = await prisma.taskTemplate.create({
    data: {
      workspaceId: parsed.data.workspaceId,
      name: parsed.data.name,
      title: parsed.data.title,
      notes: parsed.data.notes ?? null,
      priority: parsed.data.priority ?? 3,
      estimateMinutes: parsed.data.estimateMinutes ?? 30,
      bucketId: parsed.data.bucketId ?? null,
      headerImageKey: parsed.data.headerImageKey ?? null,
      checklistJson: parsed.data.checklist ?? [],
      linksJson: parsed.data.links ?? [],
      createdById: userId,
    },
  });

  return NextResponse.json({ template }, { status: 201 });
}
