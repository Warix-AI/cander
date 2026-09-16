import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { ensurePersonalWorkspace } from "@/lib/onboarding/ensure-personal-workspace";

/**
 * Creates the personal workspace early so onboarding Apps can connect
 * before onboarding_completed_at is set.
 * Requires Authorization: Bearer <access_token>.
 */
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  }

  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const userClient = createClient(supabaseUrl(), supabaseAnonKey(), {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const admin = createSupabaseAdminClient();
    const { workspaceId } = await ensurePersonalWorkspace({
      admin,
      userId: user.id,
      workspaceName: "Personal",
      kind: "personal",
    });

    return NextResponse.json({ ok: true, workspaceId });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not bootstrap workspace.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
