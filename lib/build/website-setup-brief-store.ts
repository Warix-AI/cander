/**
 * Persist website setup brief on projects.website_setup_brief.
 * Server-only (service role).
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  emptyWebsiteSetupBrief,
  normalizeWebsiteSetupBrief,
  type WebsiteSetupBrief,
} from "@/lib/ai/build/website-setup-brief";

const memoryBriefs = new Map<string, WebsiteSetupBrief>();

function memoryKey(projectId: string, workspaceId: string) {
  return `${workspaceId}:${projectId}`;
}

export async function loadWebsiteSetupBrief(
  projectId: string,
  workspaceId: string,
): Promise<WebsiteSetupBrief> {
  const key = memoryKey(projectId, workspaceId);
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("projects")
      .select("website_setup_brief, kind")
      .eq("id", projectId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (error) {
      const mem = memoryBriefs.get(key);
      return mem ? normalizeWebsiteSetupBrief(mem) : emptyWebsiteSetupBrief();
    }
    if (!data) return emptyWebsiteSetupBrief();
    const brief = normalizeWebsiteSetupBrief(data.website_setup_brief);
    memoryBriefs.set(key, brief);
    return brief;
  } catch {
    return memoryBriefs.get(key)
      ? normalizeWebsiteSetupBrief(memoryBriefs.get(key))
      : emptyWebsiteSetupBrief();
  }
}

export async function saveWebsiteSetupBrief(opts: {
  projectId: string;
  workspaceId: string;
  brief: WebsiteSetupBrief;
}): Promise<WebsiteSetupBrief> {
  const next: WebsiteSetupBrief = {
    ...opts.brief,
    updatedAt: new Date().toISOString(),
  };
  const key = memoryKey(opts.projectId, opts.workspaceId);
  memoryBriefs.set(key, next);
  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin
      .from("projects")
      .update({ website_setup_brief: next })
      .eq("id", opts.projectId)
      .eq("workspace_id", opts.workspaceId);
    if (error) {
      console.warn("[cander] website_setup_brief save failed", error.message);
    }
  } catch (err) {
    console.warn("[cander] website_setup_brief save error", err);
  }
  return next;
}

export async function getProjectKindForSetup(
  projectId: string,
  workspaceId: string,
): Promise<string | null> {
  try {
    const admin = createSupabaseAdminClient();
    const { data } = await admin
      .from("projects")
      .select("kind")
      .eq("id", projectId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    return data?.kind ? String(data.kind) : null;
  } catch {
    return null;
  }
}
