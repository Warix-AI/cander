/**
 * Server-side workspace + plan resolution for usage enforcement.
 */

import type { User } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import type { BillingPlan, Member } from "../../types.ts";
import { effectivePlan } from "../../entitlements.ts";
import { createSupabaseAdminClient } from "../../supabase/admin";
import { createSupabaseServerClient } from "../../supabase/server";
import { supabaseAnonKey, supabaseUrl } from "../../supabase/env";
import type { UsageGuardResult } from "../types.ts";

export type UsageRequestContext =
  | {
      ok: true;
      user: User;
      workspaceId: string;
      plan: BillingPlan;
      member: Member;
    }
  | { ok: false; status: number; error: string };

/** Bearer token first, optional cookie session (computer/EventSource routes). */
export async function resolveRequestUser(
  request: Request,
  opts?: { allowCookie?: boolean },
): Promise<User | null> {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;

  if (token) {
    const userClient = createClient(supabaseUrl(), supabaseAnonKey(), {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (user) return user;
  }

  if (opts?.allowCookie) {
    try {
      const cookieClient = await createSupabaseServerClient();
      if (cookieClient) {
        const {
          data: { user },
        } = await cookieClient.auth.getUser();
        if (user) return user;
      }
    } catch {
      // Cookie auth unavailable in this context.
    }
  }

  return null;
}

function profileToMember(
  profile: Record<string, unknown>,
  workspaceIds: string[],
): Member {
  const name = String(profile.name ?? "User");
  const short =
    String(profile.short_name ?? "").trim() || name.split(" ")[0] || name;
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return {
    id: String(profile.id),
    email: String(profile.email ?? ""),
    name,
    short,
    initials: initials || "U",
    plan: (profile.plan as BillingPlan) ?? "free",
    role: "Owner",
    kind: "personal",
    seatStatus: "active",
    workspaceIds,
    subscriptionStatus:
      (profile.subscription_status as Member["subscriptionStatus"]) ?? "none",
    subscriptionPeriodEnd:
      (profile.subscription_period_end as string | null | undefined) ?? undefined,
    cancelAtPeriodEnd: Boolean(profile.cancel_at_period_end),
  };
}

export async function resolveUsageContext(input: {
  user: User;
  workspaceId?: string | null;
  threadId?: string | null;
}): Promise<UsageRequestContext> {
  const admin = createSupabaseAdminClient();
  let workspaceId = input.workspaceId?.trim() || null;

  if (!workspaceId && input.threadId) {
    const { data: thread } = await admin
      .from("threads")
      .select("workspace_id, created_by")
      .eq("id", input.threadId)
      .maybeSingle();
    if (thread?.workspace_id) {
      workspaceId = String(thread.workspace_id);
      if (thread.created_by && String(thread.created_by) !== input.user.id) {
        return { ok: false, status: 403, error: "Thread access denied." };
      }
    }
  }

  if (!workspaceId) {
    const { data: memberships } = await admin
      .from("workspace_members")
      .select("workspace_id")
      .eq("profile_id", input.user.id)
      .limit(1);
    const fallbackWorkspace = memberships?.[0]?.workspace_id;
    if (fallbackWorkspace) {
      workspaceId = String(fallbackWorkspace);
    }
  }

  if (!workspaceId) {
    return {
      ok: false,
      status: 400,
      error: "workspaceId or threadId required for usage enforcement.",
    };
  }

  const { data: membership } = await admin
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("profile_id", input.user.id)
    .maybeSingle();

  if (!membership) {
    return { ok: false, status: 403, error: "Workspace access denied." };
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select(
      "id, email, name, short_name, plan, subscription_status, subscription_period_end, cancel_at_period_end",
    )
    .eq("id", input.user.id)
    .single();

  if (profileError || !profile) {
    return { ok: false, status: 403, error: "Profile not found." };
  }

  const { data: workspaces } = await admin
    .from("workspace_members")
    .select("workspace_id")
    .eq("profile_id", input.user.id);

  const workspaceIds = (workspaces ?? []).map((row: { workspace_id: string }) =>
    String(row.workspace_id),
  );
  const member = profileToMember(profile, workspaceIds);
  const plan = effectivePlan(member);

  return {
    ok: true,
    user: input.user,
    workspaceId,
    plan,
    member,
  };
}

export function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;
  return request.headers.get("x-real-ip");
}

export function usageJsonError(
  failure: Extract<UsageGuardResult, { ok: false }>,
) {
  return Response.json(
    {
      error: failure.message,
      code: failure.code,
      retryAfterSec: failure.retryAfterSec ?? null,
    },
    {
      status: failure.status,
      headers: failure.retryAfterSec
        ? { "Retry-After": String(failure.retryAfterSec) }
        : undefined,
    },
  );
}
