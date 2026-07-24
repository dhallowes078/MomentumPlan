import { NextResponse } from "next/server";
import { requireUser, jsonError } from "@/lib/api";
import { runSchedulerForUser } from "@/lib/scheduler-service";

export async function POST() {
  const { userId, error } = await requireUser();
  if (error) return error;

  try {
    const result = await runSchedulerForUser(userId);
    return NextResponse.json({
      ok: true,
      placed: result.placements.length,
      unplaced: result.unplaced,
    });
  } catch (e) {
    console.error(e);
    return jsonError(e instanceof Error ? e.message : "Schedule failed", 500);
  }
}
