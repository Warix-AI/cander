/**
 * Platform-admin authorization — separate from org Owner/Admin.
 * Server-only.
 */

import type { User } from "@supabase/supabase-js";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type PlatformAdminAuth =
  | { ok: true; user: User; token: string }
  | { ok: false; status: number; error: string };

function platformAdminIdsFromEnv(): Set<string> {
  const raw =
    process.env.CANDER_PLATFORM_ADMIN_IDS ??
    process.env.CANDER_USAGE_ADMIN_IDS ??
    "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

function platformAdminEmailsFromEnv(): Set<string> {
  const raw = process.env.CANDER_PLATFORM_ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** True when the profile is a platform operator (env allowlist or DB flag). */
export async function isPlatformAdmin(
  userId: string,
  email?: string | null,
): Promise<boolean> {
  if (!userId) return false;
  if (platformAdminIdsFromEnv().has(userId)) return true;
  if (email && platformAdminEmailsFromEnv().has(email.toLowerCase())) {
    return true;
  }
  try {
    const admin = createSupabaseAdminClient();
    const { data } = await admin
      .from("profiles")
      .select("is_platform_admin, email")
      .eq("id", userId)
      .maybeSingle();
    if (Boolean(data?.is_platform_admin)) return true;
    const profileEmail =
      typeof data?.email === "string" ? data.email.toLowerCase() : null;
    if (profileEmail && platformAdminEmailsFromEnv().has(profileEmail)) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Require an authenticated platform admin for /admin APIs and pages.
 * Org Owner/Admin alone is never enough.
 */
export async function requirePlatformAdmin(
  request: Request,
): Promise<PlatformAdminAuth> {
  const auth = await requireBearerUser(request);
  if (!auth.ok) return auth;
  if (!(await isPlatformAdmin(auth.user.id, auth.user.email))) {
    return { ok: false, status: 403, error: "Platform admin required." };
  }
  return { ok: true, user: auth.user, token: auth.token };
}
