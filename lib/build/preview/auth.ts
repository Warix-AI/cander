/**
 * Auth helpers for preview proxy (cookie session or bearer).
 */

import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { assertProjectAccess } from "@/lib/security/project-access";

export async function authorizePreviewRequest(opts: {
  request: Request;
  projectId: string;
  workspaceId: string;
}): Promise<{ ok: true; userId: string } | { ok: false; status: number; error: string }> {
  const authHeader = opts.request.headers.get("Authorization");
  const bearer = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;

  let userId: string | null = null;

  if (bearer) {
    const userClient = createClient(supabaseUrl(), supabaseAnonKey(), {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data } = await userClient.auth.getUser(bearer);
    userId = data.user?.id ?? null;
  } else {
    try {
      const supabase = await createSupabaseServerClient();
      if (!supabase) {
        return { ok: false, status: 401, error: "Unauthorized." };
      }
      const { data } = await supabase.auth.getUser();
      userId = data.user?.id ?? null;
    } catch {
      userId = null;
    }
  }

  if (!userId) {
    return { ok: false, status: 401, error: "Unauthorized." };
  }

  const access = await assertProjectAccess({
    projectId: opts.projectId,
    workspaceId: opts.workspaceId,
    userId,
  });
  if (!access.ok) {
    return { ok: false, status: 403, error: "Forbidden." };
  }

  return { ok: true, userId };
}
