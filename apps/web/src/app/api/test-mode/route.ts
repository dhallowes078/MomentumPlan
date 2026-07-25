import { NextResponse } from "next/server";
import { requireUser, jsonError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { assertWorkspaceAccess } from "@/lib/workspace";
import { runSchedulerForUser } from "@/lib/scheduler-service";

const TEST_MARKER = "[momentum-test-mode]";
const TEST_BUCKETS = [
  { key: "work", name: "🧪 Test · Work", color: "#2F5D8C" },
  { key: "personal", name: "🧪 Test · Personal", color: "#8B5E3C" },
  { key: "urgent", name: "🧪 Test · Urgent", color: "#A33B2D" },
  { key: "admin", name: "🧪 Test · Admin", color: "#0F766E" },
] as const;

function dueAt(daysFromNow: number, hour = 17) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  date.setHours(hour, 0, 0, 0);
  return date;
}

async function checkedWorkspace(userId: string, workspaceId: string) {
  if (!workspaceId) throw new Error("WORKSPACE_REQUIRED");
  await assertWorkspaceAccess(userId, workspaceId);
}

export async function GET(req: Request) {
  const { userId, error } = await requireUser();
  if (error) return error;

  const workspaceId = new URL(req.url).searchParams.get("workspaceId") ?? "";
  try {
    await checkedWorkspace(userId, workspaceId);
  } catch {
    return jsonError("Forbidden", 403);
  }

  const count = await prisma.task.count({
    where: { workspaceId, notes: { contains: TEST_MARKER } },
  });
  return NextResponse.json({ active: count > 0, count });
}

export async function POST(req: Request) {
  const { userId, error } = await requireUser();
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const workspaceId = String(body.workspaceId ?? "");
  try {
    await checkedWorkspace(userId, workspaceId);
  } catch {
    return jsonError("Forbidden", 403);
  }

  const existing = await prisma.task.count({
    where: { workspaceId, notes: { contains: TEST_MARKER } },
  });
  if (existing > 0) {
    return NextResponse.json({ active: true, count: existing, alreadyActive: true });
  }

  const bucketMap = new Map<string, string>();
  const currentCount = await prisma.bucket.count({ where: { workspaceId } });
  for (const [index, bucket] of TEST_BUCKETS.entries()) {
    const existingBucket = await prisma.bucket.findFirst({
      where: { workspaceId, name: bucket.name },
    });
    const row =
      existingBucket ??
      (await prisma.bucket.create({
        data: {
          workspaceId,
          name: bucket.name,
          color: bucket.color,
          position: currentCount + index,
        },
      }));
    bucketMap.set(bucket.key, row.id);
  }

  const samples = [
    {
      title: "Submit quarterly report",
      bucket: "urgent",
      priority: 5,
      estimateMinutes: 90,
      due: -1,
      notes: "Overdue high-priority task used to test traffic lights and scheduling.",
      checklist: ["Check final numbers", "Export PDF", "Send to leadership"],
    },
    {
      title: "Prepare client presentation",
      bucket: "work",
      priority: 5,
      estimateMinutes: 120,
      due: 0,
      notes: "Due today with a larger estimate and checklist.",
      checklist: ["Confirm agenda", "Update charts", "Rehearse opening"],
    },
    {
      title: "Call the dentist",
      bucket: "personal",
      priority: 4,
      estimateMinutes: 15,
      due: 0,
      notes: "Small personal task due today.",
    },
    {
      title: "Review pull request",
      bucket: "work",
      priority: 4,
      estimateMinutes: 45,
      due: 1,
      notes: "Technical review with a reference link.",
      links: [{ url: "https://github.com", title: "Pull request" }],
    },
    {
      title: "Renew home insurance",
      bucket: "admin",
      priority: 4,
      estimateMinutes: 30,
      due: 2,
      notes: "Administrative task with a near-term due date.",
    },
    {
      title: "Plan next sprint",
      bucket: "work",
      priority: 3,
      estimateMinutes: 60,
      due: 3,
      notes: "Medium task to exercise normal scheduling.",
      checklist: ["Review backlog", "Set sprint goal", "Estimate top stories"],
    },
    {
      title: "Book train tickets",
      bucket: "personal",
      priority: 3,
      estimateMinutes: 30,
      due: 4,
      notes: "Personal task with a future deadline.",
    },
    {
      title: "Process inbox",
      bucket: "admin",
      priority: 3,
      estimateMinutes: 25,
      due: 1,
      notes: "Short splittable admin task.",
    },
    {
      title: "Draft project brief",
      bucket: "work",
      priority: 2,
      estimateMinutes: 75,
      due: 7,
      notes: "Longer lower-priority work item.",
    },
    {
      title: "Buy birthday gift",
      bucket: "personal",
      priority: 2,
      estimateMinutes: 45,
      due: 10,
      notes: "Future personal task.",
    },
    {
      title: "Archive old documents",
      bucket: "admin",
      priority: 1,
      estimateMinutes: 120,
      due: 14,
      notes: "Large low-priority task that may be split.",
    },
    {
      title: "Read industry newsletter",
      bucket: "work",
      priority: 1,
      estimateMinutes: 20,
      due: 5,
      notes: "Tiny low-priority task.",
      links: [{ url: "https://news.ycombinator.com", title: "Reading list" }],
    },
    {
      title: "Complete onboarding checklist",
      bucket: "admin",
      priority: 3,
      estimateMinutes: 30,
      due: -2,
      status: "DONE",
      notes: "Completed sample task for the Completed tab.",
      checklist: ["Add profile photo", "Set work hours", "Connect calendar"],
    },
    {
      title: "Weekly planning review",
      bucket: "work",
      priority: 4,
      estimateMinutes: 40,
      due: 6,
      notes: "Recurring weekly sample task.",
      isRecurring: true,
      recurFreq: "WEEKLY",
      recurInterval: 1,
    },
  ] as const;

  for (const [position, sample] of samples.entries()) {
    const status = "status" in sample ? sample.status : "TODO";
    await prisma.task.create({
      data: {
        workspaceId,
        bucketId: bucketMap.get(sample.bucket),
        title: sample.title,
        notes: `${sample.notes}\n\n${TEST_MARKER}`,
        status,
        priority: sample.priority,
        estimateMinutes: sample.estimateMinutes,
        dueAt: dueAt(sample.due),
        allowSplit: sample.estimateMinutes >= 60,
        position,
        assigneeId: userId,
        createdById: userId,
        completedAt: status === "DONE" ? new Date() : null,
        isRecurring: "isRecurring" in sample ? sample.isRecurring : false,
        recurFreq: "recurFreq" in sample ? sample.recurFreq : null,
        recurInterval: "recurInterval" in sample ? sample.recurInterval : 1,
        checklistItems:
          "checklist" in sample
            ? {
                create: sample.checklist.map((text, itemPosition) => ({
                  text,
                  done: status === "DONE",
                  position: itemPosition,
                })),
              }
            : undefined,
        links:
          "links" in sample
            ? { create: sample.links.map((link) => ({ ...link })) }
            : undefined,
        events: {
          create: {
            type: "CREATED",
            actorId: userId,
            payload: { source: "test-mode" },
          },
        },
      },
    });
  }

  void runSchedulerForUser(userId).catch(console.error);
  return NextResponse.json({ active: true, count: samples.length }, { status: 201 });
}

export async function DELETE(req: Request) {
  const { userId, error } = await requireUser();
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const workspaceId = String(body.workspaceId ?? "");
  try {
    await checkedWorkspace(userId, workspaceId);
  } catch {
    return jsonError("Forbidden", 403);
  }

  const removed = await prisma.task.deleteMany({
    where: { workspaceId, notes: { contains: TEST_MARKER } },
  });

  for (const bucket of TEST_BUCKETS) {
    const row = await prisma.bucket.findFirst({
      where: { workspaceId, name: bucket.name },
      include: { _count: { select: { tasks: true } } },
    });
    if (row && row._count.tasks === 0) {
      await prisma.bucket.delete({ where: { id: row.id } });
    }
  }

  void runSchedulerForUser(userId).catch(console.error);
  return NextResponse.json({ active: false, count: 0, removed: removed.count });
}
