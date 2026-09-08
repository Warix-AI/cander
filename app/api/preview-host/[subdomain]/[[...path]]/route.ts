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

  // Auth: bearer or cookie session with project access
  const authHeader = request.headers.get("Authorization");
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

  const suffix = pathParts?.length ? `/${pathParts.join("/")}` : "/";
  // On draft host, root-relative URLs already hit this host — minimal rewrite
  return proxyToPreviewUpstream({
    request,
    upstream,
    upstreamPath: suffix,
    rewritePrefix: "",
  });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const HEAD = handle;
export const OPTIONS = handle;
