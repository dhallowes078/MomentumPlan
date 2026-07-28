import { getCloudflareContext } from "@opennextjs/cloudflare";

/** Keep background work alive after the HTTP response on Cloudflare Workers. */
export function runInBackground(work: Promise<unknown>) {
  try {
    const ctx = getCloudflareContext() as {
      ctx?: { waitUntil?: (p: Promise<unknown>) => void };
    };
    if (ctx.ctx?.waitUntil) {
      ctx.ctx.waitUntil(work.catch((err) => console.error("[background]", err)));
      return;
    }
  } catch {
    // outside Workers
  }
  void work.catch((err) => console.error("[background]", err));
}
