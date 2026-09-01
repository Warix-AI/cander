import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/data-backend";
import {
  allowedPostVerifyRedirectPaths,
  composioCallbackVerifierPath,
} from "@/lib/connectors/composio-http";
import { verifyOAuthCallback } from "@/lib/connectors/lifecycle";
import { checkConnectorRateLimitAsync } from "@/lib/connectors/rate-limit";
import {
  assertWorkspaceMember,
  resolveConnectorCallbackUser,
} from "@/lib/connectors/server-context";

export const runtime = "nodejs";

function safeRedirectPath(request: Request, result: "success" | "error"): string {
  const url = new URL(request.url);
  const next = url.searchParams.get("next")?.trim();
  const allowed = allowedPostVerifyRedirectPaths();
  const path =
    next && allowed.some((prefix) => next === prefix || next.startsWith(`${prefix}?`))
      ? next
      : "/work";
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}connectors=gmail&result=${result}`;
}

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(new URL("/work?connectors=gmail&result=error", request.url));
  }

  const configuredVerifier = process.env.COMPOSIO_CALLBACK_VERIFIER_URL?.trim();
  if (configuredVerifier) {
    const expected = new URL(configuredVerifier);
    const incoming = new URL(request.url);
    if (
      incoming.origin !== expected.origin ||
      incoming.pathname !== composioCallbackVerifierPath()
    ) {
      return NextResponse.redirect(new URL(safeRedirectPath(request, "error"), request.url));
    }
  }

  const sessionUri = new URL(request.url).searchParams.get("session_uri")?.trim();
  if (!sessionUri) {
    return NextResponse.redirect(new URL(safeRedirectPath(request, "error"), request.url));
  }

  const auth = await resolveConnectorCallbackUser(request);
  if (!auth.ok) {
    return NextResponse.redirect(new URL(safeRedirectPath(request, "error"), request.url));
  }

  try {
    const pending = await import("@/lib/connectors/oauth-state.ts");
    const admin = (await import("@/lib/supabase/admin")).createSupabaseAdminClient();
    const stateResult = await pending.findValidPendingOAuthStateForOwner(
      admin,
      auth.user.id,
    );
    if (!stateResult.ok) {
      return NextResponse.redirect(new URL(safeRedirectPath(request, "error"), request.url));
    }

    const rate = await checkConnectorRateLimitAsync({
      key: `callback:${auth.user.id}`,
      category: "connector_callback",
      workspaceId: stateResult.state.workspace_id,
      profileId: auth.user.id,
    });
    if (!rate.ok) {
      return NextResponse.redirect(new URL(safeRedirectPath(request, "error"), request.url));
    }

    const member = await assertWorkspaceMember(
      auth.user.id,
      stateResult.state.workspace_id,
    );
    if (!member) {
      return NextResponse.redirect(new URL(safeRedirectPath(request, "error"), request.url));
    }

    const { recoverOAuthStateForOwner } = await import("@/lib/connectors/oauth-recovery");
    await recoverOAuthStateForOwner(admin, auth.user.id);

    const result = await verifyOAuthCallback({
      ownerId: auth.user.id,
      sessionUri,
    });
    if (!result.ok) {
      return NextResponse.redirect(new URL(safeRedirectPath(request, "error"), request.url));
    }

    return NextResponse.redirect(new URL(safeRedirectPath(request, "success"), request.url));
  } catch {
    return NextResponse.redirect(new URL(safeRedirectPath(request, "error"), request.url));
  }
}
