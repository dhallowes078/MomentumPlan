import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { verifyDeviceToken } from "@/lib/device-token";

export async function requireUser() {
  const h = await headers();
  const header = h.get("authorization") ?? h.get("Authorization");
  if (header?.toLowerCase().startsWith("bearer ")) {
    const token = header.slice(7).trim();
    const payload = verifyDeviceToken(token);
    if (payload?.sub) {
      return {
        userId: payload.sub,
        session: {
          user: {
            id: payload.sub,
            email: payload.email ?? undefined,
            name: payload.name ?? undefined,
          },
        },
      };
    }
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const session = await auth();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { userId: session.user.id, session };
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
