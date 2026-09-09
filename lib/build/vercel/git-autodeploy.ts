/**
 * Disable Vercel Git auto-deployments so Cander's Deploy API is the only
 * production trigger (Option B). Server-only.
 */

import { vercelFetch } from "@/lib/build/vercel/api";

/**
 * Turn off Git provider auto-deploys for a customer app project.
 * Safe to call repeatedly (idempotent PATCH).
 */
export async function disableGitAutoDeployments(
  vercelProjectId: string,
): Promise<{ ok: boolean; detail?: string }> {
  const id = vercelProjectId.trim();
  if (!id) return { ok: false, detail: "missing vercelProjectId" };

  const res = await vercelFetch(`/v9/projects/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({
      gitProviderOptions: {
        createDeployments: "disabled",
      },
      // Belt-and-suspenders: ignore build step if a Git push still reaches Vercel.
      commandForIgnoringBuildStep: "exit 0",
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    console.warn("[cander:publish] disableGitAutoDeployments failed", {
      vercelProjectId: id,
      detail: detail.slice(0, 400),
    });
    return { ok: false, detail };
  }
  return { ok: true };
}
