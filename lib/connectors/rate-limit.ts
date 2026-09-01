/**
 * Lightweight per-user rate limit for connector lifecycle routes.
 */

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 30;

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function checkConnectorRateLimit(key: string): {
  ok: true;
} | {
  ok: false;
  status: 429;
  error: string;
} {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true };
  }
  if (bucket.count >= MAX_REQUESTS) {
    return {
      ok: false,
      status: 429,
      error: "Too many requests. Try again shortly.",
    };
  }
  bucket.count += 1;
  return { ok: true };
}

/** Test helper */
export function resetConnectorRateLimitsForTests() {
  buckets.clear();
}
