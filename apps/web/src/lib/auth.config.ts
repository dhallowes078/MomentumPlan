import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import {
  googleAuthConfigured,
  microsoftAuthConfigured,
  runtimeEnv,
} from "@/lib/runtime-env";

const scopes = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "User.Read",
  "Calendars.ReadWrite",
].join(" ");

function buildProviders(): NextAuthConfig["providers"] {
  const providers: NextAuthConfig["providers"] = [];

  if (microsoftAuthConfigured()) {
    providers.push(
      MicrosoftEntraID({
        clientId: runtimeEnv("AUTH_MICROSOFT_ENTRA_ID_ID")!,
        clientSecret: runtimeEnv("AUTH_MICROSOFT_ENTRA_ID_SECRET")!,
        issuer: runtimeEnv("AUTH_MICROSOFT_ENTRA_ID_ISSUER"),
        authorization: {
          params: {
            scope: scopes,
          },
        },
        allowDangerousEmailAccountLinking: true,
      })
    );
  }

  if (googleAuthConfigured()) {
    providers.push(
      Google({
        clientId: runtimeEnv("AUTH_GOOGLE_ID")!,
        clientSecret: runtimeEnv("AUTH_GOOGLE_SECRET")!,
        allowDangerousEmailAccountLinking: true,
      })
    );
  }

  return providers;
}

export { buildProviders };

/**
 * Edge-safe auth config used by middleware.
 * Local / device-code providers that need Prisma live in auth.ts only.
 * Call buildProviders() when constructing NextAuth so Worker secrets are read at init.
 */
export const authConfig = {
  providers: [],
  pages: {
    signIn: "/login",
  },
  trustHost: true,
  callbacks: {
    authorized({ auth, request }) {
      const path = request.nextUrl.pathname;
      const bearer = request.headers.get("authorization")?.toLowerCase().startsWith("bearer ");
      const isPublic =
        path.startsWith("/login") ||
        path.startsWith("/mobile-auth") ||
        path.startsWith("/api/auth") ||
        path.startsWith("/api/health") ||
        path.startsWith("/manifest") ||
        path.startsWith("/icon") ||
        path.startsWith("/sw.js") ||
        path.startsWith("/invite") ||
        path === "/" ||
        (path.startsWith("/api/") && Boolean(bearer));
      if (isPublic) return true;
      return !!auth?.user;
    },
    async jwt({ token, user, account }) {
      if (user?.id) token.sub = user.id;
      if (account?.provider === "microsoft-entra-id") {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
