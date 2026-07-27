import { getCloudflareContext } from "@opennextjs/cloudflare";
// Use the WASM build so Workers never load the Node query-engine via fs.readdir.
import { PrismaClient } from "@prisma/client/wasm";
import { PrismaD1 } from "@prisma/adapter-d1";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

type D1Binding = ConstructorParameters<typeof PrismaD1>[0];
type CloudflareEnv = { DB?: D1Binding };

function createLocalClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

function d1FromEnv(env: CloudflareEnv | undefined | null): D1Binding | null {
  return env?.DB ?? null;
}

function getD1Sync(): D1Binding | null {
  try {
    // Hide from webpack static analysis (cloudflare: scheme is Workers-only).
    const dynamicRequire = new Function(
      "id",
      "return require(id)"
    ) as (id: string) => { env?: CloudflareEnv };
    const fromWorkers = d1FromEnv(dynamicRequire("cloudflare:workers")?.env);
    if (fromWorkers) return fromWorkers;
  } catch {
    // outside workerd
  }

  try {
    const { env } = getCloudflareContext() as { env?: CloudflareEnv };
    return d1FromEnv(env);
  } catch {
    return null;
  }
}

async function getD1Async(): Promise<D1Binding | null> {
  const sync = getD1Sync();
  if (sync) return sync;

  try {
    const { env } = (await getCloudflareContext({
      async: true,
    })) as { env?: CloudflareEnv };
    return d1FromEnv(env);
  } catch (err) {
    console.error("[db] async getCloudflareContext failed", err);
    return null;
  }
}

function clientForD1(db: D1Binding) {
  return new PrismaClient({ adapter: new PrismaD1(db) });
}

/** Prefer this in Server Actions / async routes on Cloudflare. */
export async function getPrisma(): Promise<PrismaClient> {
  const db = await getD1Async();
  if (db) return clientForD1(db);

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Cloudflare D1 binding `DB` is not available (cannot use local SQLite on Workers)"
    );
  }

  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createLocalClient();
  }
  return globalForPrisma.prisma;
}

function getClientSync(): PrismaClient {
  const db = getD1Sync();
  if (db) return clientForD1(db);

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Cloudflare D1 binding `DB` is not available (cannot use local SQLite on Workers)"
    );
  }

  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createLocalClient();
  }
  return globalForPrisma.prisma;
}

/**
 * Sync-looking Prisma client for existing call sites.
 * On Workers, prefers `cloudflare:workers` then OpenNext sync context.
 * Server Actions should prefer `await getPrisma()`.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getClientSync();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
