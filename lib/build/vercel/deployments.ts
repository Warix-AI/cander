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

const IN_FLIGHT_STATES = new Set([
  "QUEUED",
  "INITIALIZING",
  "BUILDING",
  "UPLOADING",
  "DEPLOYING",
]);

/**
 * Find a production deployment already created for this exact commit (READY
 * or still building). Publish reuses it instead of minting a duplicate build
 * when a previous attempt timed out after the POST succeeded.
 */
export async function findProductionDeploymentForSha(opts: {
  vercelProjectId: string;
  sha: string;
}): Promise<(VercelDeploymentResult & { errorMessage?: string | null }) | null> {
  try {
    const res = await vercelFetch(
      `/v6/deployments?projectId=${encodeURIComponent(opts.vercelProjectId)}&target=production&limit=20`,
    );
    if (!res.ok) return null;
    const body = (await res.json()) as {
      deployments?: Array<{
        uid?: string;
        url?: string;
        state?: string;
        readyState?: string;
        meta?: Record<string, string | undefined>;
        inspectorUrl?: string;
      }>;
    };
    const sha = opts.sha.toLowerCase();
    const match = (body.deployments || []).find((d) => {
      const m = d.meta || {};
      const full = (m.githubCommitSha || "").toLowerCase();
      const short = (m.gitSha || "").toLowerCase();
      return (full && full === sha) || (short && sha.startsWith(short));
    });
    if (!match?.uid) return null;
    const state = String(match.readyState || match.state || "UNKNOWN");
    if (state !== "READY" && !IN_FLIGHT_STATES.has(state)) return null;
    return {
      id: match.uid,
      url: normalizeUrl(match.url) ?? "",
      inspectorUrl: normalizeUrl(match.inspectorUrl),
      readyState: state,
      target: "production",
    };
  } catch {
    return null;
  }
}

/**
 * Poll an existing deployment until it leaves the in-flight states.
 */
export async function waitForDeploymentReady(opts: {
  deploymentId: string;
  timeoutMs?: number;
  /** Called every poll tick (used for publish attempt heartbeats). */
  onTick?: () => Promise<void> | void;
}): Promise<VercelDeploymentResult> {
  const timeoutMs = opts.timeoutMs ?? 240_000;
  const started = Date.now();
  let latest = await readDeployment(opts.deploymentId);
  while (IN_FLIGHT_STATES.has(latest.readyState) && Date.now() - started < timeoutMs) {
    await new Promise((r) => setTimeout(r, 4000));
    latest = await readDeployment(opts.deploymentId);
    if (opts.onTick) await opts.onTick();
  }
  if (IN_FLIGHT_STATES.has(latest.readyState)) {
    throw new Error(
      `Production deploy still ${latest.readyState} after ${Math.round(timeoutMs / 1000)}s.`,
    );
  }
  if (latest.readyState !== "READY") {
    let detail = latest.errorMessage ? ` ${latest.errorMessage}` : "";
    try {
      const eventsRes = await vercelFetch(
        `/v3/deployments/${encodeURIComponent(opts.deploymentId)}/events?limit=30&direction=backward`,
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

/**
 * Create a production deployment from a GitHub commit and wait until ready/error.
 * Reuses a deployment that already exists for the SHA (no duplicate builds).
 */
export async function createProductionDeployment(opts: {
  vercelProjectId: string;
  projectName: string;
  githubRepoId: number;
  /** Branch name used as git ref (draft or main). */
  ref: string;
  sha: string;
  /** Correlation id for logs / Vercel meta. */
  publishAttemptId?: string;
  /** Max wait in ms (default 4 minutes). */
  timeoutMs?: number;
  onTick?: () => Promise<void> | void;
}): Promise<VercelDeploymentResult> {
  const existing = await findProductionDeploymentForSha({
    vercelProjectId: opts.vercelProjectId,
    sha: opts.sha,
  });
  if (existing) {
    console.info("[cander:publish] reusing existing deployment for sha", {
      vercelDeploymentId: existing.id,
      readyState: existing.readyState,
      publishAttemptId: opts.publishAttemptId,
    });
    if (existing.readyState === "READY" && existing.url) return existing;
    return waitForDeploymentReady({
      deploymentId: existing.id,
      timeoutMs: opts.timeoutMs,
      onTick: opts.onTick,
    });
  }

  // No forceNew — duplicate POSTs for the same SHA must not mint new builds.
  // vercelFetch also refuses to retry this POST on 5xx/429.
  const res = await vercelFetch("/v13/deployments", {
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
        // Must not inherit project-level "exit 0" ignore which cancels Deploy API builds.
        commandForIgnoringBuildStep: null,
      },
      meta: {
        canderPublish: "1",
        gitSha: opts.sha.slice(0, 12),
        ...(opts.publishAttemptId
          ? { canderPublishAttemptId: opts.publishAttemptId }
          : {}),
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

  return waitForDeploymentReady({
    deploymentId: created.id,
    timeoutMs: opts.timeoutMs,
    onTick: opts.onTick,
  });
}
