/**
 * Lightweight per-user rate limit for connector lifecycle routes.
 * Falls back to in-memory when durable store is unavailable.
 */

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 30;

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function checkInMemoryRateLimit(key: string): {
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

export function checkConnectorRateLimit(key: string): {
  ok: true;
} | {
  ok: false;
  status: 429;
  error: string;
} {
  return checkInMemoryRateLimit(key);
}

export async function checkConnectorRateLimitAsync(input: {
  key: string;
  category: import("./durable-rate-limit.ts").ConnectorRateCategory;
  workspaceId: string;
  profileId: string;
}): Promise<
  | { ok: true }
  | { ok: false; status: 429; error: string }
> {
  try {
    const { checkConnectorRateLimitDurable } = await import("./durable-rate-limit.ts");
    const durable = await checkConnectorRateLimitDurable({
      category: input.category,
      workspaceId: input.workspaceId,
      profileId: input.profileId,
    });
    if (!durable.ok) return durable;
  } catch {
    /* durable unavailable */
  }
  return checkInMemoryRateLimit(input.key);
}

/** Test helper */
export function resetConnectorRateLimitsForTests() {
  buckets.clear();
}
