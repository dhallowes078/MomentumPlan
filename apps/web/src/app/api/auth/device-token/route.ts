import { NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/db";
import { normalizeAccessCode, ensureAccessCode } from "@/lib/access-code";
import { ensurePersonalWorkspace } from "@/lib/workspace";
import { signDeviceToken } from "@/lib/device-token";
import { jsonError } from "@/lib/api";

const schema = z.object({
  code: z.string().min(1),
});

function withCors(res: NextResponse, req: Request) {
  const origin = req.headers.get("origin") ?? "*";
  res.headers.set("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  res.headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With"
  );
  return res;
}

export async function OPTIONS(req: Request) {
  return withCors(new NextResponse(null, { status: 204 }), req);
}

export async function POST(req: Request) {
  try {
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return withCors(jsonError("code required"), req);

    const code = normalizeAccessCode(parsed.data.code);
    if (code.length !== 6) {
      return withCors(jsonError("Enter the 6-digit device code", 400), req);
    }

    const db = await getPrisma();
    const user = await db.user.findUnique({ where: { accessCode: code } });
    if (!user) return withCors(jsonError("Invalid code", 401), req);

    await ensurePersonalWorkspace(user.id, user.name ?? user.email ?? "User", db);
    await ensureAccessCode(user.id, db).catch(console.error);

    const token = signDeviceToken({
      id: user.id,
      email: user.email,
      name: user.name,
    });

    return withCors(
      NextResponse.json({
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
      }),
      req
    );
  } catch (err) {
    console.error("[device-token]", err);
    return withCors(jsonError("Could not link device", 500), req);
  }
}
