/**
 * Browser client for Website Builder V2 jobs.
 */

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/data-backend";

export type BuildJobClient = {
  id: string;
  projectId: string;
  workspaceId: string;
  status:
    | "queued"
    | "running"
    | "verifying"
    | "ready_for_review"
    | "failed"
    | "cancelled";
  progressNote: string;
  resultSummary: string | null;
  facts: {
    mode: "create" | "edit";
    summary?: string;
    error?: string;
    draftSha?: string | null;
    startedAt?: string;
    finishedAt?: string;
    ackMessageId?: string | null;
  };
  createdAt: string;
  updatedAt: string;
};

export type BuildJobEventClient = {
  seq: number;
  kind: string;
  message: string;
  payload?: Record<string, unknown>;
  ts?: string;
};

export type BuildJobSnapshot = {
  job: BuildJobClient | null;
  events: BuildJobEventClient[];
};

async function authToken() {
  if (!isSupabaseConfigured()) return null;
  const supabase = createSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export async function startBuildJobClient(opts: {
  projectId: string;
  workspaceId: string;
  mode: "create" | "edit";
  instruction?: string;
  threadId?: string | null;
  ackMessageId?: string | null;
}): Promise<{ ok: boolean; job?: BuildJobClient; error?: string; status: number }> {
  const token = await authToken();
  if (!token) return { ok: false, error: "Not signed in.", status: 401 };
  const requestedAt = Date.now();
  let res: Response;
  try {
    res = await fetch(
      `/api/projects/${encodeURIComponent(opts.projectId)}/build-jobs`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspaceId: opts.workspaceId,
          mode: opts.mode,
          instruction: opts.instruction,
          threadId: opts.threadId ?? null,
          ackMessageId: opts.ackMessageId ?? null,
        }),
      },
    );
  } catch (err) {
    // Network drop ("Failed to fetch"): the server may still have created the
    // job. Look for one that appeared since we asked before reporting failure.
    const recovered = await recoverJustStartedJob(opts, requestedAt);
    if (recovered) return { ok: true, job: recovered, status: 200 };
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error",
      status: 0,
    };
  }
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    job?: BuildJobClient;
    error?: string;
  };
  return {
    ok: Boolean(res.ok && data.ok !== false),
    job: data.job,
    error: data.error,
    status: res.status,
  };
}

const ACTIVE_STATUSES = new Set(["queued", "running", "verifying"]);

async function recoverJustStartedJob(
  opts: { projectId: string; workspaceId: string; mode: "create" | "edit" },
  requestedAt: number,
): Promise<BuildJobClient | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    await new Promise((r) => setTimeout(r, 1500));
    const snap = await fetchLatestBuildJobClient({
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
    }).catch(() => null);
    const job = snap?.job;
    if (
      job &&
      ACTIVE_STATUSES.has(job.status) &&
      job.facts?.mode === opts.mode &&
      Date.parse(job.createdAt) >= requestedAt - 5_000
    ) {
      return job;
    }
  }
  return null;
}

export async function fetchLatestBuildJobClient(opts: {
  projectId: string;
  workspaceId: string;
  afterSeq?: number;
}): Promise<BuildJobSnapshot | null> {
  const token = await authToken();
  if (!token) return null;
  const params = new URLSearchParams({
    workspaceId: opts.workspaceId,
    after: String(opts.afterSeq ?? 0),
  });
  const res = await fetch(
    `/api/projects/${encodeURIComponent(opts.projectId)}/build-jobs?${params}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as BuildJobSnapshot | null;
  return data ?? null;
}

export async function fetchBuildJobClient(opts: {
  projectId: string;
  workspaceId: string;
  jobId: string;
  afterSeq?: number;
}): Promise<BuildJobSnapshot | null> {
  const token = await authToken();
  if (!token) return null;
  const params = new URLSearchParams({
    workspaceId: opts.workspaceId,
    after: String(opts.afterSeq ?? 0),
  });
  const res = await fetch(
    `/api/projects/${encodeURIComponent(opts.projectId)}/build-jobs/${encodeURIComponent(opts.jobId)}?${params}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as BuildJobSnapshot | null;
  return data ?? null;
}
