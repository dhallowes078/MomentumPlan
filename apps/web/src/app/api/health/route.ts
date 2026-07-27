import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

export async function GET() {
  const report: Record<string, unknown> = {
    ok: false,
    nodeEnv: process.env.NODE_ENV,
    hasAuthSecret: Boolean(process.env.AUTH_SECRET),
    allowLocalLogin: process.env.AUTH_ALLOW_LOCAL_LOGIN,
  };

  try {
    const sync = getCloudflareContext();
    report.syncContextKeys = sync?.env ? Object.keys(sync.env as object) : null;
    report.syncHasDb = Boolean((sync?.env as { DB?: unknown } | undefined)?.DB);
  } catch (err) {
    report.syncContextError = err instanceof Error ? err.message : String(err);
  }

  try {
    const asyncCtx = await getCloudflareContext({ async: true });
    report.asyncContextKeys = asyncCtx?.env
      ? Object.keys(asyncCtx.env as object)
      : null;
    report.asyncHasDb = Boolean(
      (asyncCtx?.env as { DB?: unknown } | undefined)?.DB
    );
  } catch (err) {
    report.asyncContextError = err instanceof Error ? err.message : String(err);
  }

  try {
    const db = await getPrisma();
    const users = await db.user.count();
    report.ok = true;
    report.userCount = users;
  } catch (err) {
    report.prismaError = err instanceof Error ? err.message : String(err);
    report.prismaStack =
      err instanceof Error ? err.stack?.split("\n").slice(0, 8) : null;
  }

  return NextResponse.json(report, { status: report.ok ? 200 : 500 });
}
