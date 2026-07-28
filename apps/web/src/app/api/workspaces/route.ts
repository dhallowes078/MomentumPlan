import { NextResponse } from "next/server";
import { requireUser, jsonError } from "@/lib/api";
import { getUserWorkspaces, ensurePersonalWorkspace } from "@/lib/workspace";
import { prisma } from "@/lib/db";

export async function GET() {
  const { userId, session, error } = await requireUser();
  if (error) return error;

  let memberships = await getUserWorkspaces(userId);
  if (memberships.length === 0) {
    await ensurePersonalWorkspace(
      userId,
      session?.user?.name ?? session?.user?.email ?? "User"
    );
    memberships = await getUserWorkspaces(userId);
  }

  return NextResponse.json({
    workspaces: memberships.map((m) => ({
      role: m.role,
      ...m.workspace,
    })),
  });
}

export async function POST(req: Request) {
  const { userId, error } = await requireUser();
  if (error) return error;

  const body = await req.json();
  const name = String(body.name ?? "").trim();
  if (!name) return jsonError("Name required");

  const slugBase = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
  let slug = slugBase;
  let n = 1;
  while (await prisma.workspace.findUnique({ where: { slug } })) {
    slug = `${slugBase}-${n++}`;
  }

  const workspace = await prisma.workspace.create({
    data: {
      name,
      slug,
      members: { create: { userId, role: "OWNER" } },
      buckets: { create: { name: "Inbox", position: 0 } },
    },
    include: { buckets: true },
  });

  return NextResponse.json({ workspace });
}
