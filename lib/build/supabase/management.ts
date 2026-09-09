/**
 * Supabase Management API scaffolding (per-app project provision — Phase 4).
 * Server-only. Never expose management tokens to the browser.
 */

import { getSupabaseManagementConfig } from "@/lib/build/config";

const MANAGEMENT_API = "https://api.supabase.com/v1";

export function supabaseManagementConfigured(): boolean {
  return getSupabaseManagementConfig() !== null;
}

export async function supabaseManagementFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const config = getSupabaseManagementConfig();
  if (!config) {
    throw new Error("Supabase Management API is not configured.");
  }
  let relative = path;
  if (!relative.startsWith("http")) {
    // Callers may pass "/projects" or legacy "/v1/projects" — base already includes /v1.
    if (relative.startsWith("/v1/")) relative = relative.slice(3);
    else if (relative.startsWith("v1/")) relative = `/${relative.slice(3)}`;
    if (!relative.startsWith("/")) relative = `/${relative}`;
  }
  const url = relative.startsWith("http") ? relative : `${MANAGEMENT_API}${relative}`;
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

export function getSupabaseManagementOrgId(): string | null {
  return getSupabaseManagementConfig()?.orgId ?? null;
}
