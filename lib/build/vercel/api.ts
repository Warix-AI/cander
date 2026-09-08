/**
 * Vercel platform client (Deployments / Projects / Domains).
 * Uses REST + team-scoped token — never the Vercel CLI.
 * Server-only.
 */

import { getVercelTeamConfig } from "@/lib/build/config";

const VERCEL_API = "https://api.vercel.com";

export function vercelApiConfigured(): boolean {
  return Boolean(getVercelTeamConfig().token);
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * Team-scoped fetch with bounded retries on 429 / 5xx.
 */
export async function vercelFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const { token, teamId } = getVercelTeamConfig();
  if (!token) {
    throw new Error("VERCEL_TOKEN is not configured.");
  }
  const url = new URL(path.startsWith("http") ? path : `${VERCEL_API}${path}`);
  if (teamId && !url.searchParams.has("teamId")) {
    url.searchParams.set("teamId", teamId);
  }

  const maxAttempts = 4;
  let last: Response | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    last = res;
    if (res.status !== 429 && res.status < 500) {
      return res;
    }
    if (attempt === maxAttempts) return res;
    const retryAfter = Number(res.headers.get("retry-after") || 0);
    const backoff = retryAfter > 0 ? retryAfter * 1000 : 400 * attempt ** 2;
    await sleep(Math.min(backoff, 8000));
  }
  return last!;
}
