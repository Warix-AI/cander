/**
 * Ensure a Warix-team Vercel project for a Cander app (lazy).
 * Server-only.
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getVercelTeamConfig } from "@/lib/build/config";
import { vercelFetch } from "@/lib/build/vercel/api";

function vercelProjectName(projectId: string, fullName: string): string {
  const repo = fullName.split("/")[1] || `cander-${projectId.replace(/-/g, "").slice(0, 20)}`;
  // Vercel project names: lowercase, alphanumeric, hyphens
  return repo
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 52);
}

export type EnsuredVercelProject = {
  vercelProjectId: string;
  name: string;
  created: boolean;
};

/**
 * Published Cander sites are public products, even when the Warix Vercel team
 * defaults new projects to protected deployments. The public *.cander.app
 * proxy uses the deployment's *.vercel.app origin, so upstream protection
 * would otherwise render Vercel's login page through the friendly hostname.
 */
export async function ensurePublicVercelProjectAccess(
  vercelProjectId: string,
): Promise<void> {
  const res = await vercelFetch(
    `/v9/projects/${encodeURIComponent(vercelProjectId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        ssoProtection: null,
        passwordProtection: null,
        trustedIps: null,
        // Prefer root package.json for Next detection.
        rootDirectory: null,
      }),
    },
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(
      `Could not make the published site publicly accessible: ${detail}. ` +
        "VERCEL_TOKEN must be allowed to manage deployment protection.",
    );
  }
}

/**
 * Create or reuse the per-app Vercel project linked to the GitHub repo.
 */
export async function ensureAppVercelProject(opts: {
  projectId: string;
  workspaceId: string;
}): Promise<EnsuredVercelProject> {
  const { token } = getVercelTeamConfig();
  if (!token) {
    throw new Error("VERCEL_TOKEN is not configured for production deploys.");
  }

  const admin = createSupabaseAdminClient();
  const { data: project, error } = await admin
    .from("projects")
    .select("github_full_name, github_repo_id, vercel_project_id, title")
    .eq("id", opts.projectId)
    .eq("workspace_id", opts.workspaceId)
    .maybeSingle();
  if (error || !project?.github_full_name) {
    throw new Error("Project has no bound GitHub repository.");
  }

  const existingId = project.vercel_project_id
    ? String(project.vercel_project_id)
    : null;
  if (existingId) {
    const res = await vercelFetch(
      `/v9/projects/${encodeURIComponent(existingId)}`,
    );
    if (res.ok) {
      const body = (await res.json()) as { id?: string; name?: string };
      const vercelProjectId = body.id || existingId;
      await ensurePublicVercelProjectAccess(vercelProjectId);
      return {
        vercelProjectId,
        name: body.name || existingId,
        created: false,
      };
    }
  }

  const fullName = String(project.github_full_name);
  const name = vercelProjectName(opts.projectId, fullName);

  // Try create with GitHub link (requires Vercel↔GitHub integration on the team).
  let res = await vercelFetch("/v11/projects", {
    method: "POST",
    body: JSON.stringify({
      name,
      framework: "nextjs",
      gitRepository: {
        type: "github",
        repo: fullName,
      },
    }),
  });

  if (!res.ok) {
    // Fallback: project without git link (deploy still uses gitSource by repoId).
    const errText = await res.text().catch(() => "");
    console.warn("[cander] vercel project create with git failed", errText);
    res = await vercelFetch("/v11/projects", {
      method: "POST",
      body: JSON.stringify({
        name,
        framework: "nextjs",
      }),
    });
  }

  if (!res.ok) {
    // Maybe name collision — look up by name
    const lookup = await vercelFetch(
      `/v9/projects/${encodeURIComponent(name)}`,
    );
    if (lookup.ok) {
      const body = (await lookup.json()) as { id: string; name: string };
      await ensurePublicVercelProjectAccess(body.id);
      await admin
        .from("projects")
        .update({
          vercel_project_id: body.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", opts.projectId)
        .eq("workspace_id", opts.workspaceId);
      return {
        vercelProjectId: body.id,
        name: body.name,
        created: false,
      };
    }
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(
      `Could not create Vercel project: ${detail}. ` +
        "VERCEL_TOKEN must be a team token with permission to create projects " +
        "(not a single-project token).",
    );
  }

  const body = (await res.json()) as { id: string; name: string };
  await ensurePublicVercelProjectAccess(body.id);
  await admin
    .from("projects")
    .update({
      vercel_project_id: body.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", opts.projectId)
    .eq("workspace_id", opts.workspaceId);

  return {
    vercelProjectId: body.id,
    name: body.name,
    created: true,
  };
}
