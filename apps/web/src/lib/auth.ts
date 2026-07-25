import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { ensurePersonalWorkspace } from "@/lib/workspace";
import { authConfig } from "@/lib/auth.config";
import { ensureAccessCode, normalizeAccessCode } from "@/lib/access-code";

const localLoginEnabled = process.env.AUTH_ALLOW_LOCAL_LOGIN === "true";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  providers: [
    ...authConfig.providers,
    ...(localLoginEnabled
      ? [
          Credentials({
            id: "local",
            name: "New local account",
            credentials: {},
            async authorize() {
              // Every "Start fresh" click gets its own isolated user + workspace + code.
              const id = `local-${randomUUID()}`;
              const email = `${id}@momentum.local`;
              const user = await prisma.user.create({
                data: {
                  id,
                  name: "Local User",
                  email,
                },
              });
              await ensurePersonalWorkspace(user.id, user.name ?? "Local User");
              await ensureAccessCode(user.id);
              return {
                id: user.id,
                name: user.name,
                email: user.email,
              };
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
        const code = normalizeAccessCode(String(credentials?.code ?? ""));
        if (code.length !== 6) return null;
        const user = await prisma.user.findUnique({ where: { accessCode: code } });
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
        await ensurePersonalWorkspace(user.id, user.name ?? user.email);
        await ensureAccessCode(user.id).catch(console.error);
      }
    },
    async linkAccount({ user, account }) {
      if (
        account.provider === "microsoft-entra-id" &&
        user.id &&
        (account.access_token || account.refresh_token)
      ) {
        await prisma.calendarConnection.upsert({
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
        await prisma.schedulePrefs.upsert({
          where: { userId: user.id },
          create: { userId: user.id },
          update: {},
        });
      }
    },
    async signIn({ user, account }) {
      if (user.id && account?.provider === "local") {
        // User row is created in authorize(); just ensure workspace/code exist.
        await ensurePersonalWorkspace(user.id, user.name ?? user.email ?? "Local User");
        await ensureAccessCode(user.id).catch(console.error);
      }

      if (user.id && (account?.provider === "device-code" || account?.provider === "google")) {
        await ensurePersonalWorkspace(user.id, user.name ?? user.email ?? "User");
        await ensureAccessCode(user.id).catch(console.error);
      }

      if (user.id && account?.provider === "microsoft-entra-id") {
        await ensurePersonalWorkspace(user.id, user.name ?? user.email ?? "User");
        await ensureAccessCode(user.id).catch(console.error);
        if (account.access_token || account.refresh_token) {
          await prisma.calendarConnection.upsert({
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
