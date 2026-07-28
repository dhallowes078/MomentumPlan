import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { randomUUID } from "crypto";
import { prisma, getPrisma } from "@/lib/db";
import { ensurePersonalWorkspace } from "@/lib/workspace";
import { authConfig, buildProviders } from "@/lib/auth.config";
import { ensureAccessCode, normalizeAccessCode } from "@/lib/access-code";
import { runtimeEnv } from "@/lib/runtime-env";

const localLoginEnabled = runtimeEnv("AUTH_ALLOW_LOCAL_LOGIN") === "true";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  providers: [
    ...buildProviders(),
    ...(localLoginEnabled
      ? [
          Credentials({
            id: "local",
            name: "New local account",
            credentials: {},
            async authorize() {
              try {
                // Server Actions need async Cloudflare context for D1.
                const db = await getPrisma();
                const id = `local-${randomUUID()}`;
                const email = `${id}@momentum.local`;
                const user = await db.user.create({
                  data: {
                    id,
                    name: "Local User",
                    email,
                  },
                });
                await ensurePersonalWorkspace(user.id, user.name ?? "Local User", db);
                await ensureAccessCode(user.id, db);
                return {
                  id: user.id,
                  name: user.name,
                  email: user.email,
                };
              } catch (err) {
                console.error("[auth] local authorize failed", err);
                throw err;
              }
            },
          }),
        ]
      : []),
    Credentials({
      id: "device-code",
      name: "Device code",
      credentials: {
        code: { label: "Code", type: "text" },
      },
      async authorize(credentials) {
        const db = await getPrisma();
        const code = normalizeAccessCode(String(credentials?.code ?? ""));
        if (code.length !== 6) return null;
        const user = await db.user.findUnique({ where: { accessCode: code } });
        if (!user) return null;
        return {
          id: user.id,
          name: user.name,
          email: user.email,
        };
      },
    }),
  ],
  events: {
    async createUser({ user }) {
      if (user.id && user.email) {
        const db = await getPrisma();
        await ensurePersonalWorkspace(user.id, user.name ?? user.email, db);
        await ensureAccessCode(user.id, db).catch(console.error);
      }
    },
    async linkAccount({ user, account }) {
      if (
        account.provider === "microsoft-entra-id" &&
        user.id &&
        (account.access_token || account.refresh_token)
      ) {
        const db = await getPrisma();
        await db.calendarConnection.upsert({
          where: { userId: user.id },
          create: {
            userId: user.id,
            accessToken: account.access_token ?? null,
            refreshToken: account.refresh_token ?? null,
            expiresAt: account.expires_at
              ? new Date(account.expires_at * 1000)
              : null,
          },
          update: {
            accessToken: account.access_token ?? null,
            refreshToken: account.refresh_token ?? null,
            expiresAt: account.expires_at
              ? new Date(account.expires_at * 1000)
              : null,
          },
        });
        await db.schedulePrefs.upsert({
          where: { userId: user.id },
          create: { userId: user.id },
          update: {},
        });
      }
    },
    async signIn({ user, account }) {
      const db = await getPrisma();
      if (user.id && account?.provider === "local") {
        await ensurePersonalWorkspace(user.id, user.name ?? user.email ?? "Local User", db);
        await ensureAccessCode(user.id, db).catch(console.error);
      }

      if (user.id && (account?.provider === "device-code" || account?.provider === "google")) {
        await ensurePersonalWorkspace(user.id, user.name ?? user.email ?? "User", db);
        await ensureAccessCode(user.id, db).catch(console.error);
      }

      if (user.id && account?.provider === "microsoft-entra-id") {
        await ensurePersonalWorkspace(user.id, user.name ?? user.email ?? "User", db);
        await ensureAccessCode(user.id, db).catch(console.error);
        if (account.access_token || account.refresh_token) {
          await db.calendarConnection.upsert({
            where: { userId: user.id },
            create: {
              userId: user.id,
              accessToken: account.access_token ?? null,
              refreshToken: account.refresh_token ?? null,
              expiresAt: account.expires_at
                ? new Date(account.expires_at * 1000)
                : null,
            },
            update: {
              accessToken: account.access_token ?? null,
              refreshToken: account.refresh_token ?? null,
              expiresAt: account.expires_at
                ? new Date(account.expires_at * 1000)
                : null,
            },
          });
        }
      }
    },
  },
});
