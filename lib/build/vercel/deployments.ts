/**
 * Create + poll production deployments on Warix Vercel.
 * Server-only.
 */

import { vercelFetch } from "@/lib/build/vercel/api";

export type VercelDeploymentResult = {
  id: string;
  url: string;
  inspectorUrl: string | null;
  readyState: string;
  target: string | null;
};

function normalizeUrl(hostOrUrl: string | undefined | null): string | null {
  if (!hostOrUrl) return null;
  const raw = hostOrUrl.trim();
  if (!raw) return null;
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return `https://${raw}`;
}

async function readDeployment(id: string): Promise<
  VercelDeploymentResult & { errorMessage?: string | null }
> {
  const res = await vercelFetch(`/v13/deployments/${encodeURIComponent(id)}`);
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`Could not read deployment: ${detail}`);
  }
  const body = (await res.json()) as {
    id?: string;
    url?: string;
    inspectorUrl?: string;
    readyState?: string;
    status?: string;
    target?: string;
    errorMessage?: string | null;
  };
  const readyState = String(body.readyState || body.status || "UNKNOWN");
  return {
    id: String(body.id || id),
    url: normalizeUrl(body.url) ?? "",
    inspectorUrl: normalizeUrl(body.inspectorUrl),
    readyState,
    target: body.target ?? null,
    errorMessage: body.errorMessage ?? null,
  };
}

/**
 * Create a production deployment from a GitHub commit and wait until ready/error.
 */
export async function createProductionDeployment(opts: {
  vercelProjectId: string;
  projectName: string;
  githubRepoId: number;
  /** Branch name used as git ref (draft or main). */
  ref: string;
  sha: string;
  /** Max wait in ms (default 4 minutes). */
  timeoutMs?: number;
}): Promise<VercelDeploymentResult> {
  const res = await vercelFetch("/v13/deployments?forceNew=1", {
    method: "POST",
    body: JSON.stringify({
      name: opts.projectName,
      project: opts.vercelProjectId,
      target: "production",
      gitSource: {
        type: "github",
        repoId: opts.githubRepoId,
        ref: opts.ref,
        sha: opts.sha,
      },
      projectSettings: {
        framework: "nextjs",
        rootDirectory: null,
        buildCommand: "next build",
        installCommand: "npm install",
      },
      meta: {
        canderPublish: "1",
        gitSha: opts.sha.slice(0, 12),
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`Vercel deploy failed to start: ${detail}`);
  }

  const created = (await res.json()) as {
    id: string;
    url?: string;
    readyState?: string;
  };
  if (!created.id) {
    throw new Error("Vercel deploy response missing id.");
  }

  const timeoutMs = opts.timeoutMs ?? 240_000;
  const started = Date.now();
  let latest = await readDeployment(created.id);

  const inFlight = new Set([
    "QUEUED",
    "INITIALIZING",
    "BUILDING",
    "UPLOADING",
    "DEPLOYING",
  ]);
  while (inFlight.has(latest.readyState) && Date.now() - started < timeoutMs) {
    await new Promise((r) => setTimeout(r, 4000));
    latest = await readDeployment(created.id);
  }

  if (latest.readyState !== "READY") {
    let detail = "";
    if (latest.errorMessage) {
      detail = ` ${latest.errorMessage}`;
    }
    try {
      const eventsRes = await vercelFetch(
        `/v3/deployments/${encodeURIComponent(created.id)}/events?limit=30&direction=backward`,
      );
      if (eventsRes.ok) {
        const events = (await eventsRes.json()) as Array<{
          type?: string;
          text?: string;
          payload?: { text?: string };
        }>;
        const lines = (Array.isArray(events) ? events : [])
          .map((e) => e.text || e.payload?.text || "")
          .filter(Boolean)
          .slice(0, 8);
        if (lines.length) {
          detail = `${detail} Build log: ${lines.join(" | ").slice(0, 500)}`;
        }
      }
    } catch {
      /* best-effort */
    }
    throw new Error(
      `Production deploy did not become ready (state=${latest.readyState}).${detail} Previous published site was left unchanged.`,
    );
  }
  if (!latest.url) {
    throw new Error("Production deploy ready but missing URL.");
  }

  return latest;
}
