/**
 * Server-only connector request context — Bearer user + workspace membership.
 */

import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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

/** OAuth callback verifier — Bearer token or Supabase cookie session. */
export async function resolveConnectorCallbackUser(
  request: Request,
): Promise<{ ok: true; user: User } | { ok: false; status: number; error: string }> {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;

  if (token) {
    const client = createClient(supabaseUrl(), supabaseAnonKey(), {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const {
      data: { user },
    } = await client.auth.getUser();
    if (user) return { ok: true, user };
  }

  try {
    const cookieClient = await createSupabaseServerClient();
    if (cookieClient) {
      const {
        data: { user },
      } = await cookieClient.auth.getUser();
      if (user) return { ok: true, user };
    }
  } catch {
    /* cookie auth unavailable */
  }

  return { ok: false, ...unauthorizedError() };
}

export async function assertWorkspaceMember(
  userId: string,
  workspaceId: string,
): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { data: membership } = await admin
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("profile_id", userId)
    .maybeSingle();
  return Boolean(membership);
}
