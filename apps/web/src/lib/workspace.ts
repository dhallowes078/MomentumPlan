import { prisma } from "@/lib/db";

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 40) || "workspace"
  );
}

export async function ensurePersonalWorkspace(userId: string, name: string) {
  const existing = await prisma.workspaceMember.findFirst({
    where: { userId, role: "OWNER" },
    include: { workspace: true },
  });
  if (existing) return existing.workspace;

  const base = slugify(`${name}-personal`);
  let slug = base;
  let n = 1;
  while (await prisma.workspace.findUnique({ where: { slug } })) {
    slug = `${base}-${n++}`;
  }

  const workspace = await prisma.workspace.create({
    data: {
      name: `${name.split(" ")[0]}'s Workspace`,
      slug,
      members: {
        create: { userId, role: "OWNER" },
      },
      buckets: {
        create: [
          { name: "Inbox", color: "#3D6B4F", position: 0 },
          { name: "Work", color: "#2F5D8C", position: 1 },
          { name: "Personal", color: "#8B5E3C", position: 2 },
        ],
      },
    },
  });

  await prisma.schedulePrefs.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });

  return workspace;
}

export async function getUserWorkspaces(userId: string) {
  return prisma.workspaceMember.findMany({
    where: { userId },
    include: { workspace: { include: { buckets: { orderBy: { position: "asc" } } } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function assertWorkspaceAccess(
  userId: string,
  workspaceId: string,
  roles?: Array<"OWNER" | "MEMBER">
) {
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!member) throw new Error("FORBIDDEN");
  if (roles && !roles.includes(member.role as "OWNER" | "MEMBER")) {
    throw new Error("FORBIDDEN");
  }
  return member;
}
