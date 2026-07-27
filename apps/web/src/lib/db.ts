import { PrismaClient } from "@prisma/client";
import { PrismaD1 } from "@prisma/adapter-d1";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createLocalClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

function getClient(): PrismaClient {
  try {
    // Lazy require so `next build` / local tooling don't need Workers context.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCloudflareContext } = require("@opennextjs/cloudflare") as {
      getCloudflareContext: () => { env?: { DB?: unknown } };
    };
    const { env } = getCloudflareContext();
    if (env?.DB) {
      // PrismaD1 expects the D1Database binding from Workers.
      return new PrismaClient({ adapter: new PrismaD1(env.DB as ConstructorParameters<typeof PrismaD1>[0]) });
    }
  } catch {
    // Not running on Cloudflare (local `next dev` / Node).
  }

  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createLocalClient();
  }
  return globalForPrisma.prisma;
}

/**
 * Prisma client that uses D1 on Cloudflare Workers and SQLite file locally.
 * Proxy so existing `prisma.model…` call sites stay sync-looking.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getClient();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
