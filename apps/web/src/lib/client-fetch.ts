type CacheEntry = {
  data: unknown;
  at: number;
  inflight?: Promise<unknown>;
};

const cache = new Map<string, CacheEntry>();

/** Soft TTL: serve cache immediately, refresh in background when older than this. */
const DEFAULT_SOFT_TTL_MS = 15_000;
/** Hard TTL: don't serve stale data older than this without waiting for network. */
const DEFAULT_HARD_TTL_MS = 5 * 60_000;

function matches(key: string, pattern: string) {
  return key === pattern || key.startsWith(pattern) || key.includes(pattern);
}

export function invalidateClientCache(pattern?: string) {
  if (!pattern) {
    cache.clear();
    return;
  }
  for (const key of [...cache.keys()]) {
    if (matches(key, pattern)) cache.delete(key);
  }
}

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  if (!res.ok) {
    const err = new Error(`Request failed: ${res.status}`);
    (err as Error & { status: number }).status = res.status;
    throw err;
  }
  return res.json();
}

/**
 * Stale-while-revalidate GET helper for client navigations.
 * Instant when revisiting a page; refreshes in the background.
 */
export async function cachedJson<T>(
  url: string,
  opts?: {
    softTtlMs?: number;
    hardTtlMs?: number;
    force?: boolean;
    init?: RequestInit;
  }
): Promise<T> {
  const softTtl = opts?.softTtlMs ?? DEFAULT_SOFT_TTL_MS;
  const hardTtl = opts?.hardTtlMs ?? DEFAULT_HARD_TTL_MS;
  const now = Date.now();
  const entry = cache.get(url);
  const freshEnough =
    entry != null && entry.data !== undefined && entry.at > 0;

  if (!opts?.force && freshEnough && now - entry.at < softTtl) {
    return entry.data as T;
  }

  if (!opts?.force && freshEnough && now - entry.at < hardTtl) {
    if (!entry.inflight) {
      entry.inflight = fetchJson(url, opts?.init)
        .then((data) => {
          cache.set(url, { data, at: Date.now() });
          return data;
        })
        .catch(() => entry.data)
        .finally(() => {
          const cur = cache.get(url);
          if (cur) delete cur.inflight;
        });
    }
    return entry.data as T;
  }

  if (entry?.inflight) {
    return entry.inflight as Promise<T>;
  }

  const inflight = fetchJson(url, opts?.init).then((data) => {
    cache.set(url, { data, at: Date.now() });
    return data;
  });
  cache.set(url, {
    data: freshEnough ? entry!.data : undefined,
    at: freshEnough ? entry!.at : 0,
    inflight,
  });
  try {
    return (await inflight) as T;
  } finally {
    const cur = cache.get(url);
    if (cur) delete cur.inflight;
  }
}

