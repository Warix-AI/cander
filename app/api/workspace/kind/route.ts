import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { isSupabaseConfigured } from "@/lib/data-backend";
import type { WorkspaceKind } from "@/lib/types";

/** Update a workspace's personal/organization classification for its owner. */
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

  let body: { workspaceId?: string; kind?: WorkspaceKind };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const workspaceId = body.workspaceId?.trim() ?? "";
  const kind = body.kind;
  if (!workspaceId || (kind !== "personal" && kind !== "business")) {
    return NextResponse.json({ error: "Workspace and kind are required." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: membership } = await admin
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("profile_id", user.id)
    .maybeSingle();
  if (membership?.role !== "Owner") {
    return NextResponse.json({ error: "Only the workspace owner can change this." }, { status: 403 });
  }

  let orgId: string | null = null;
  if (kind === "business") {
    const { data: owner } = await admin
      .from("org_members")
      .select("org_id, kind, seat_status, role")
      .eq("profile_id", user.id)
      .eq("role", "Owner")
      .eq("kind", "org")
      .eq("seat_status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!owner?.org_id) {
      return NextResponse.json(
        { error: "Activate an organization before using an organizational workspace." },
        { status: 409 },
      );
    }
    orgId = String(owner.org_id);
  }

  const { data: workspace, error } = await admin
    .from("workspaces")
    .update({
      org_id: orgId,
      kind,
      personal: kind === "personal",
    })
    .eq("id", workspaceId)
    .select("id, name, kind, personal, spaces, budget, spend")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!workspace) return NextResponse.json({ error: "Workspace not found." }, { status: 404 });

  return NextResponse.json({ workspace });
}
