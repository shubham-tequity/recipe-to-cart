/**
 * In-memory per-key sliding-window rate limiter.
 *
 * Caveat: state is per serverless instance. Fluid Compute keeps instances warm
 * and reuses them, but parallel concurrent instances each keep their own map —
 * so the effective limit is `limit × warm_instances` under heavy load. Fine for
 * the prototype's $5 budget; swap to Upstash Redis before going truly public.
 */

type Entry = { times: number[] };

const STORE = new Map<string, Entry>();
const MAX_KEYS = 10_000;

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number; resetsAt: string };

export function checkRateLimit(
  key: string,
  opts: { limit: number; windowMs: number }
): RateLimitResult {
  const now = Date.now();
  const cutoff = now - opts.windowMs;

  let entry = STORE.get(key);
  if (!entry) {
    if (STORE.size >= MAX_KEYS) {
      const first = STORE.keys().next().value;
      if (first !== undefined) STORE.delete(first);
    }
    entry = { times: [] };
    STORE.set(key, entry);
  }

  entry.times = entry.times.filter((t) => t > cutoff);

  if (entry.times.length >= opts.limit) {
    const oldest = entry.times[0];
    const resetAt = oldest + opts.windowMs;
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
      resetsAt: new Date(resetAt).toISOString(),
    };
  }

  entry.times.push(now);
  return { ok: true };
}
