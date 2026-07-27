import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

function applyCors(res: NextResponse, req: Request) {
  const origin = req.headers.get("origin") ?? "*";
  res.headers.set("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  res.headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With"
  );
  res.headers.set("Access-Control-Allow-Credentials", "true");
  return res;
}

export default auth((req) => {
  const path = req.nextUrl.pathname;

  if (req.method === "OPTIONS" && path.startsWith("/api/")) {
    return applyCors(new NextResponse(null, { status: 204 }), req);
  }

  const loggedIn = !!req.auth;
  const hasBearer = Boolean(
    req.headers.get("authorization")?.toLowerCase().startsWith("bearer ")
  );

  // Device-token exchange and bearer-authenticated APIs skip cookie gate.
  if (path.startsWith("/api/auth/device-token") || (path.startsWith("/api/") && hasBearer)) {
    return applyCors(NextResponse.next(), req);
  }

  if (loggedIn && (path === "/login" || path === "/")) {
    return NextResponse.redirect(new URL("/today", req.nextUrl));
  }

  if (!loggedIn && path === "/") {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  if (path.startsWith("/api/")) {
    return applyCors(NextResponse.next(), req);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
