/**
 * Client helper: bearer token for /api/admin/* calls.
 */

"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export async function adminFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    throw new Error("Not signed in.");
  }
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(path, { ...init, headers });
}

export async function adminJson<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await adminFetch(path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof body?.error === "string"
        ? body.error
        : `Request failed (${res.status})`,
    );
  }
  return body as T;
}
