import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { signDeviceToken } from "@/lib/device-token";
import { ensureAccessCode } from "@/lib/access-code";
import { ensurePersonalWorkspace } from "@/lib/workspace";
import { getPrisma } from "@/lib/db";
import { runtimeEnv } from "@/lib/runtime-env";

export const dynamic = "force-dynamic";

const APP_SCHEME = "app.momentum.plan://auth";

function siteOrigin(req: Request) {
  const configured = runtimeEnv("AUTH_URL")?.replace(/\/$/, "");
  if (configured) return configured;
  return new URL(req.url).origin;
}

export async function GET(req: Request) {
  const origin = siteOrigin(req);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.redirect(new URL("/mobile-auth/google", origin));
  }

  try {
    const db = await getPrisma();
    await ensurePersonalWorkspace(
      userId,
      session.user?.name ?? session.user?.email ?? "User",
      db
    );
    await ensureAccessCode(userId, db).catch(console.error);
  } catch (err) {
    console.error("[mobile-auth/complete] workspace", err);
  }

  const token = signDeviceToken({
    id: userId,
    email: session.user?.email,
    name: session.user?.name,
  });
  const deepLink = `${APP_SCHEME}?token=${encodeURIComponent(token)}`;

  // Custom-scheme Location redirects are unreliable in Custom Tabs; serve a
  // tiny page that navigates via JS and offers a manual fallback.
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Return to Momentum</title>
  <style>
    body { font-family: system-ui, sans-serif; display: grid; place-items: center; min-height: 100dvh; margin: 0; padding: 1.5rem; background: #f4f6f5; color: #1a1f1c; }
    .card { max-width: 360px; text-align: center; }
    a { display: inline-block; margin-top: 1rem; padding: 0.75rem 1.1rem; border-radius: 10px; background: #1f4d3a; color: #fff; text-decoration: none; font-weight: 600; }
    p { color: #5c6570; line-height: 1.45; }
  </style>
</head>
<body>
  <div class="card">
    <h1 style="margin:0;font-size:1.5rem">Momentum</h1>
    <p>Signed in. Opening the app…</p>
    <p id="hint" hidden>If nothing happens, tap the button below.</p>
    <a id="open" href="${deepLink}">Open Momentum</a>
  </div>
  <script>
    var link = ${JSON.stringify(deepLink)};
    try { location.replace(link); } catch (e) {}
    setTimeout(function () {
      var hint = document.getElementById("hint");
      if (hint) hint.hidden = false;
    }, 1200);
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
