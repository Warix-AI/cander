/**
 * Vercel platform client scaffolding (Deployments / Domains — later phases).
 * Uses REST + team-scoped token — never the Vercel CLI.
 * Server-only.
 */

import { getVercelTeamConfig } from "@/lib/build/config";

const VERCEL_API = "https://api.vercel.com";

export function vercelApiConfigured(): boolean {
  return Boolean(getVercelTeamConfig().token);
}

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
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}
