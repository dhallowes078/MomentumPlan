import { NextResponse } from "next/server";
import { requireUser, jsonError } from "@/lib/api";
import { ensureAccessCode, formatAccessCode, regenerateAccessCode } from "@/lib/access-code";

export async function GET() {
  const { userId, error } = await requireUser();
  if (error) return error;

  try {
    const code = await ensureAccessCode(userId);
    return NextResponse.json({
      code,
      display: formatAccessCode(code),
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to get code", 500);
  }
}

export async function POST(req: Request) {
  const { userId, error } = await requireUser();
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  if (body?.regenerate !== true) {
    return jsonError("Pass { regenerate: true } to mint a new code");
  }

  try {
    const code = await regenerateAccessCode(userId);
    return NextResponse.json({
      code,
      display: formatAccessCode(code),
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to regenerate", 500);
  }
}
