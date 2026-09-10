/**
 * Host-based draft preview proxy:
 * draft--{subdomain}.cander.app → /api/preview-host/[subdomain]/[[...path]]
 */

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assertProjectAccess } from "@/lib/security/project-access";
import { proxyToPreviewUpstream } from "@/lib/build/preview/proxy-handler";
import { resolvePreviewUpstreamBySubdomain } from "@/lib/build/preview/upstream";
import { createClient } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import {
  PREVIEW_SESSION_COOKIE,
  PREVIEW_SESSION_PATH,
  PREVIEW_SESSION_TTL_MS,
  readCookie,
  verifyPreviewToken,
} from "@/lib/build/preview/preview-token";

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteCtx = {
  params: Promise<{ subdomain: string; path?: string[] }>;
};

async function handle(request: Request, ctx: RouteCtx): Promise<Response> {
  const { subdomain: rawSub, path: pathParts } = await ctx.params;
  const subdomain = rawSub?.trim().toLowerCase();
  if (!subdomain || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(subdomain)) {
    return new Response("Invalid preview host.", { status: 400 });
  }

  const upstream = await resolvePreviewUpstreamBySubdomain(subdomain);
  if (!upstream) {
    return new Response(
      "No active draft preview for this project.",
      { status: 404, headers: { "Content-Type": "text/plain" } },
    );
  }

  const suffix = pathParts?.length ? `/${pathParts.join("/")}` : "/";
  const reqUrl = new URL(request.url);

  // Handshake: the shell opens the iframe on /__cander/session?t=…&next=/ —
  // we verify the signed token, set a host-scoped cookie and redirect. From
  // then on the user's app behaves like a real site (its own cookies, forms,
  // client routing) on its own origin.
  if (suffix === PREVIEW_SESSION_PATH) {
    const claims = verifyPreviewToken(reqUrl.searchParams.get("t"));
    if (!claims || claims.pid !== upstream.projectId || claims.ws !== upstream.workspaceId) {
      return new Response("This preview link has expired. Reopen the project in Cander.", {
        status: 401,
        headers: { "Content-Type": "text/plain" },
      });
    }
    const next = reqUrl.searchParams.get("next") || "/";
    const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
    const token = reqUrl.searchParams.get("t") as string;
    const secure = reqUrl.protocol === "https:";
    const cookie = [
      `${PREVIEW_SESSION_COOKIE}=${token}`,
      "Path=/",
      "HttpOnly",
      // Same-site with the Cander app (both under cander.app); Lax keeps it
      // working inside the iframe and blocks cross-site leakage.
      "SameSite=Lax",
      `Max-Age=${Math.floor(PREVIEW_SESSION_TTL_MS / 1000)}`,
      secure ? "Secure" : "",
    ]
      .filter(Boolean)
      .join("; ");
    return new Response(null, {
      status: 303,
      headers: {
        Location: safeNext,
        "Set-Cookie": cookie,
        "Cache-Control": "no-store",
      },
    });
  }

  // Auth: preview cookie (iframe), bearer, or Cander session cookie.
  const authHeader = request.headers.get("Authorization");
  const bearer = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;
  let userId: string | null = null;
  const previewClaims = verifyPreviewToken(
    readCookie(request.headers.get("cookie"), PREVIEW_SESSION_COOKIE),
  );
  if (
    previewClaims &&
    previewClaims.pid === upstream.projectId &&
    previewClaims.ws === upstream.workspaceId
  ) {
    userId = previewClaims.uid;
  } else if (bearer) {
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
        return new Response("Sign in to Cander to view this draft preview.", {
          status: 401,
          headers: { "Content-Type": "text/plain" },
        });
      }
      const { data } = await supabase.auth.getUser();
      userId = data.user?.id ?? null;
    } catch {
      userId = null;
    }
  }

  if (!userId) {
    return new Response("Sign in to Cander to view this draft preview.", {
      status: 401,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const access = await assertProjectAccess({
    projectId: upstream.projectId,
    workspaceId: upstream.workspaceId,
    userId,
  });
  if (!access.ok) {
    return new Response("Forbidden.", { status: 403 });
  }

  // On draft host, root-relative URLs already hit this host — no rewrite, and
  // the app keeps its own cookies (the origin is this project's alone).
  return proxyToPreviewUpstream({
    request,
    upstream,
    upstreamPath: suffix,
    rewritePrefix: "",
    passCookies: true,
  });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const HEAD = handle;
export const OPTIONS = handle;
