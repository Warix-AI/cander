/**
 * Ensure a Warix-team Vercel project for a Cander app (lazy).
 * Server-only.
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getVercelTeamConfig } from "@/lib/build/config";
import { vercelFetch } from "@/lib/build/vercel/api";
import { disableGitAutoDeployments } from "@/lib/build/vercel/git-autodeploy";

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
      // Option B: Deploy API only — never let Git pushes create production builds.
      await disableGitAutoDeployments(vercelProjectId);
      return {
        vercelProjectId,
        name: body.name || existingId,
        created: false,
      };
    }
    // Orphan / wrong-team id — clear so recreate can persist a fresh project id.
    console.warn("[cander] stale vercel_project_id; recreating", {
      projectId: opts.projectId,
      existingId,
      status: res.status,
    });
    await admin
      .from("projects")
      .update({
        vercel_project_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", opts.projectId)
      .eq("workspace_id", opts.workspaceId);
  }

  const fullName = String(project.github_full_name);
  const name = vercelProjectName(opts.projectId, fullName);

  // Prefer create WITHOUT gitRepository so pushes never auto-deploy.
  // Deployments still use gitSource.repoId + sha via the Deployments API.
  const res = await vercelFetch("/v11/projects", {
    method: "POST",
    body: JSON.stringify({
      name,
      framework: "nextjs",
    }),
  });

  // Never fall back to a git-linked project: a link makes every push to the
  // draft branch (and every main promotion) mint a second production build.
  // Deployments always come from the Deployments API with an explicit SHA.
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.warn("[cander] vercel project create failed", { name, status: res.status, errText: errText.slice(0, 300) });
  }

  if (!res.ok) {
    // Maybe name collision — look up by name
    const lookup = await vercelFetch(
      `/v9/projects/${encodeURIComponent(name)}`,
    );
    if (lookup.ok) {
      const body = (await lookup.json()) as { id: string; name: string };
      await ensurePublicVercelProjectAccess(body.id);
      await disableGitAutoDeployments(body.id);
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
        "VERCEL_TOKEN must allow action=create on resource=project for this team " +
        "(check token scopes / team role; teamId is passed as a query param).",
    );
  }

  const body = (await res.json()) as { id: string; name: string };
  await ensurePublicVercelProjectAccess(body.id);
  await disableGitAutoDeployments(body.id);
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
