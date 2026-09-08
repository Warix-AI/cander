/**
 * Resolve and validate sandbox preview upstreams (SSRF-safe).
 * Server-only.
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { BuildSandboxState } from "@/lib/build/sandbox/constants";
import { BUILD_APP_PORT } from "@/lib/build/sandbox/constants";
import {
  draftPreviewHost,
  draftPreviewUrl,
  isAllowedPreviewUpstreamOrigin,
  projectPreviewPath,
} from "@/lib/build/preview/urls";

export type ResolvedPreviewUpstream = {
  projectId: string;
  workspaceId: string;
  subdomain: string | null;
  sessionId: string | null;
  upstreamOrigin: string;
};

export async function resolvePreviewUpstreamForProject(opts: {
  projectId: string;
  workspaceId: string;
}): Promise<ResolvedPreviewUpstream | null> {
  const admin = createSupabaseAdminClient();
  const { data: project } = await admin
    .from("projects")
    .select("id, workspace_id, cander_subdomain, sandbox_session_id")
    .eq("id", opts.projectId)
    .eq("workspace_id", opts.workspaceId)
    .maybeSingle();
  if (!project) return null;

  const sessionId = project.sandbox_session_id
    ? String(project.sandbox_session_id)
    : null;
  if (!sessionId) return null;

  const { data: session } = await admin
    .from("computer_sessions")
    .select("id, build_state, stream_url, status")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session || session.status === "stopped" || session.status === "error") {
    return null;
  }

  const buildState = (session.build_state ?? null) as BuildSandboxState | null;
  const raw =
    buildState?.previewUpstream?.trim() ||
    (typeof session.stream_url === "string" ? session.stream_url.trim() : "");
  if (!raw) return null;

  let origin: string;
  try {
    const u = new URL(raw);
    // Prefer origin; sandbox.domain(port) usually returns full origin for that port
    origin = u.origin;
  } catch {
    return null;
  }

  if (!isAllowedPreviewUpstreamOrigin(origin)) {
    console.warn("[cander] rejected preview upstream", origin);
    return null;
  }

  return {
    projectId: String(project.id),
    workspaceId: String(project.workspace_id),
    subdomain: project.cander_subdomain
      ? String(project.cander_subdomain)
      : null,
    sessionId,
    upstreamOrigin: origin,
  };
}

export async function resolvePreviewUpstreamBySubdomain(
  subdomain: string,
): Promise<ResolvedPreviewUpstream | null> {
  const admin = createSupabaseAdminClient();
  const { data: project } = await admin
    .from("projects")
    .select("id, workspace_id")
    .eq("cander_subdomain", subdomain)
    .maybeSingle();
  if (!project) return null;
  return resolvePreviewUpstreamForProject({
    projectId: String(project.id),
    workspaceId: String(project.workspace_id),
  });
}

export {
  BUILD_APP_PORT,
  draftPreviewHost,
  draftPreviewUrl,
  isAllowedPreviewUpstreamOrigin,
  projectPreviewPath,
};
