import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { isSupabaseConfigured } from "@/lib/data-backend";

/** Persist a workspace icon URL for the workspace owner. */
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  }

  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;
  if (!token) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const userClient = createClient(supabaseUrl(), supabaseAnonKey(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let body: { workspaceId?: string; iconUrl?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const workspaceId = body.workspaceId?.trim() ?? "";
  const iconUrl = body.iconUrl?.trim() || null;
  if (!workspaceId) {
    return NextResponse.json({ error: "Workspace id is required." }, { status: 400 });
  }
  if (iconUrl && !/^https?:\/\//i.test(iconUrl)) {
    return NextResponse.json({ error: "Workspace icon URL is invalid." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: membership } = await admin
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("profile_id", user.id)
    .maybeSingle();
  if (membership?.role !== "Owner") {
    return NextResponse.json({ error: "Only the workspace owner can change its icon." }, { status: 403 });
  }

  const { error } = await admin
    .from("workspaces")
    .update({ icon_url: iconUrl })
    .eq("id", workspaceId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, iconUrl });
}
