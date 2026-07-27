import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { normalizeAccessCode, ensureAccessCode } from "@/lib/access-code";
import { ensurePersonalWorkspace } from "@/lib/workspace";
import { signDeviceToken } from "@/lib/device-token";
import { jsonError } from "@/lib/api";

const schema = z.object({
  code: z.string().min(1),
});

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError("code required");

  const code = normalizeAccessCode(parsed.data.code);
  if (code.length !== 6) return jsonError("Enter the 6-digit device code", 400);

  const user = await prisma.user.findUnique({ where: { accessCode: code } });
  if (!user) return jsonError("Invalid code", 401);

  await ensurePersonalWorkspace(user.id, user.name ?? user.email ?? "User");
  await ensureAccessCode(user.id).catch(console.error);

  const token = signDeviceToken({
    id: user.id,
    email: user.email,
    name: user.name,
  });

  return NextResponse.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
    },
  });
}
