/**
 * Server-only connector request context — Bearer user + workspace membership.
 */

import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  unauthorizedError,
  workspaceAccessDeniedError,
} from "./authz";

export type ConnectorRequestContext =
  | {
      ok: true;
      user: User;
      token: string;
      client: SupabaseClient;
      workspaceId: string;
    }
  | { ok: false; status: number; error: string };

export async function resolveConnectorRequest(input: {
  request: Request;
  workspaceId: string | null | undefined;
}): Promise<ConnectorRequestContext> {
  const authHeader = input.request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;
  if (!token) {
    return { ok: false, ...unauthorizedError() };
  }

  const workspaceId = input.workspaceId?.trim();
  if (!workspaceId) {
    return { ok: false, status: 400, error: "Invalid payload." };
  }

  const client = createClient(supabaseUrl(), supabaseAnonKey(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    return { ok: false, ...unauthorizedError() };
  }

  const admin = createSupabaseAdminClient();
  const { data: membership } = await admin
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!membership) {
    return { ok: false, ...workspaceAccessDeniedError() };
  }

  return { ok: true, user, token, client, workspaceId };
}
