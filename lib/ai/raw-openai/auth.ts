/**
 * Bearer auth for raw OpenAI multimodal routes.
 * Server-only — never import from client components.
 */

import { createClient, type User } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

export type RawOpenAIAuth =
  | { ok: true; user: User; token: string }
  | { ok: false; status: number; error: string };

export function requireBearerUser(request: Request): Promise<RawOpenAIAuth> {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;
  if (!token) {
    return Promise.resolve({ ok: false, status: 401, error: "Unauthorized." });
  }

  const userClient = createClient(supabaseUrl(), supabaseAnonKey(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return userClient.auth.getUser(token).then(({ data: { user } }) => {
    if (!user) {
      return { ok: false, status: 401, error: "Unauthorized." } as const;
    }
    return { ok: true, user, token } as const;
  });
}

/** When thread exists in DB, ensure caller owns it. Missing thread = local-only OK. */
export async function assertThreadOwnedByUser(
  threadId: string | null | undefined,
  userId: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!threadId) return { ok: true };
  try {
    const admin = createSupabaseAdminClient();
    const { data } = await admin
      .from("threads")
      .select("id, created_by")
      .eq("id", threadId)
      .maybeSingle();
    if (!data) return { ok: true }; // not synced yet
    if (data.created_by !== userId) {
      return { ok: false, status: 403, error: "Thread not found." };
    }
    return { ok: true };
  } catch {
    return { ok: false, status: 503, error: "Unable to verify thread ownership." };
  }
}
