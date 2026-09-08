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
  const url = path.startsWith("http") ? path : `${MANAGEMENT_API}${path}`;
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
