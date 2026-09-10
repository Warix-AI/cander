/**
 * Build jobs = rows in public.ai_tasks (task_type 'build_job') plus a progress
 * stream in public.build_job_events. Server-only (service role).
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { WebsiteSetupAnswers } from "@/lib/ai/build/website-setup-brief";

export const BUILD_JOB_TASK_TYPE = "build_job";

export type BuildJobMode = "create" | "edit";

export type BuildJobStatus =
  | "queued"
  | "running"
  | "verifying"
  | "ready_for_review"
  | "failed"
  | "cancelled";

export const ACTIVE_BUILD_JOB_STATUSES: BuildJobStatus[] = [
  "queued",
  "running",
  "verifying",
];

export type BuildJobTransport = "proxy" | "direct";

export type BuildJobFacts = {
  v2: true;
  mode: BuildJobMode;
  userId: string;
  sessionId?: string | null;
  /** Bytes of events.jsonl already ingested from the sandbox. */
  eventOffset: number;
  /** Last event seq stored. */
  eventSeq: number;
  instruction?: string;
  /** Recent chat turns (compact) so follow-up edits keep their meaning. */
  conversation?: string | null;
  brief?: WebsiteSetupAnswers | null;
  models?: { planner: string; coder: string };
  transport?: BuildJobTransport;
  startedAt?: string;
  finishedAt?: string;
  lastEventAt?: string;
  draftSha?: string | null;
  /** Assistant-facing summary from the builder's finish() call. */
  summary?: string;
  error?: string;
  /** Chat thread + message the job should report back to (edit mode). */
  ackMessageId?: string | null;
};

export type BuildJob = {
  id: string;
  projectId: string;
  workspaceId: string;
  threadId: string;
  title: string;
  goal: string;
  status: BuildJobStatus;
  progressNote: string;
  resultSummary: string | null;
  facts: BuildJobFacts;
  createdAt: string;
  updatedAt: string;
};

export type BuildJobEventKind =
  | "status"
  | "progress"
  | "plan"
  | "tool"
  | "file"
  | "llm"
  | "verify"
  | "log"
  | "finished"
  | "failed";

export type BuildJobEvent = {
  seq: number;
  kind: BuildJobEventKind | string;
  message: string;
  payload?: Record<string, unknown>;
  ts?: string;
};

type AiTaskRow = {
  id: string;
  workspace_id: string | null;
  thread_id: string;
  project_id: string | null;
  title: string;
  goal: string;
  status: string;
  progress_note: string;
  result_summary: string | null;
  facts: unknown;
  created_at: string;
  updated_at: string;
};

function rowToJob(row: AiTaskRow): BuildJob {
  const facts = (row.facts && typeof row.facts === "object"
    ? row.facts
    : {}) as Partial<BuildJobFacts>;
  return {
    id: row.id,
    projectId: String(row.project_id ?? ""),
    workspaceId: String(row.workspace_id ?? ""),
    threadId: row.thread_id,
    title: row.title,
    goal: row.goal,
    status: row.status as BuildJobStatus,
    progressNote: row.progress_note ?? "",
    resultSummary: row.result_summary ?? null,
    facts: {
      v2: true,
      mode: facts.mode ?? "create",
      userId: facts.userId ?? "",
      eventOffset: facts.eventOffset ?? 0,
      eventSeq: facts.eventSeq ?? 0,
      ...facts,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT =
  "id, workspace_id, thread_id, project_id, title, goal, status, progress_note, result_summary, facts, created_at, updated_at";

export async function createBuildJob(opts: {
  projectId: string;
  workspaceId: string;
  userId: string;
  threadId?: string | null;
  mode: BuildJobMode;
  title: string;
  goal: string;
  instruction?: string;
  conversation?: string | null;
  brief?: WebsiteSetupAnswers | null;
  ackMessageId?: string | null;
}): Promise<BuildJob> {
  const admin = createSupabaseAdminClient();
  const facts: BuildJobFacts = {
    v2: true,
    mode: opts.mode,
    userId: opts.userId,
    eventOffset: 0,
    eventSeq: 0,
    instruction: opts.instruction,
    conversation: opts.conversation ?? null,
    brief: opts.brief ?? null,
    ackMessageId: opts.ackMessageId ?? null,
  };
  const { data, error } = await admin
    .from("ai_tasks")
    .insert({
      workspace_id: opts.workspaceId,
      project_id: opts.projectId,
      thread_id: opts.threadId?.trim() || `build-job:${opts.projectId}`,
      title: opts.title,
      goal: opts.goal,
      kind: "multi_step",
      task_type: BUILD_JOB_TASK_TYPE,
      status: "queued",
      progress_note: "Queued",
      facts,
    })
    .select(SELECT)
    .single();
  if (error || !data) {
    throw new Error(error?.message || "Failed to create build job.");
  }
  return rowToJob(data as AiTaskRow);
}

export async function getBuildJob(jobId: string): Promise<BuildJob | null> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("ai_tasks")
    .select(SELECT)
    .eq("id", jobId)
    .eq("task_type", BUILD_JOB_TASK_TYPE)
    .maybeSingle();
  return data ? rowToJob(data as AiTaskRow) : null;
}

export async function findActiveBuildJob(opts: {
  projectId: string;
  workspaceId: string;
}): Promise<BuildJob | null> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("ai_tasks")
    .select(SELECT)
    .eq("project_id", opts.projectId)
    .eq("workspace_id", opts.workspaceId)
    .eq("task_type", BUILD_JOB_TASK_TYPE)
    .in("status", ACTIVE_BUILD_JOB_STATUSES)
    .order("created_at", { ascending: false })
    .limit(5);
  const rows = (data ?? []) as AiTaskRow[];
  // Prefer the job actually doing work over queued followers.
  const running =
    rows.find((r) => r.status === "running") ??
    rows.find((r) => r.status === "verifying") ??
    rows[0];
  return running ? rowToJob(running) : null;
}

/** Oldest job still waiting to start (coalesced edits). */
export async function findQueuedBuildJob(opts: {
  projectId: string;
  workspaceId: string;
}): Promise<BuildJob | null> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("ai_tasks")
    .select(SELECT)
    .eq("project_id", opts.projectId)
    .eq("workspace_id", opts.workspaceId)
    .eq("task_type", BUILD_JOB_TASK_TYPE)
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data ? rowToJob(data as AiTaskRow) : null;
}

export async function findLatestBuildJob(opts: {
  projectId: string;
  workspaceId: string;
}): Promise<BuildJob | null> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("ai_tasks")
    .select(SELECT)
    .eq("project_id", opts.projectId)
    .eq("workspace_id", opts.workspaceId)
    .eq("task_type", BUILD_JOB_TASK_TYPE)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? rowToJob(data as AiTaskRow) : null;
}

export async function updateBuildJob(
  jobId: string,
  patch: {
    status?: BuildJobStatus;
    progressNote?: string;
    resultSummary?: string | null;
    facts?: Partial<BuildJobFacts>;
  },
): Promise<BuildJob | null> {
  const admin = createSupabaseAdminClient();
  const current = await getBuildJob(jobId);
  if (!current) return null;
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status) row.status = patch.status;
  if (patch.progressNote !== undefined) row.progress_note = patch.progressNote;
  if (patch.resultSummary !== undefined) row.result_summary = patch.resultSummary;
  if (patch.facts) row.facts = { ...current.facts, ...patch.facts };
  const { data, error } = await admin
    .from("ai_tasks")
    .update(row)
    .eq("id", jobId)
    .select(SELECT)
    .single();
  if (error || !data) return null;
  return rowToJob(data as AiTaskRow);
}

/**
 * Atomic status transition; returns false when another worker already moved
 * the job. Used to make completion idempotent across concurrent pollers.
 */
export async function transitionBuildJob(opts: {
  jobId: string;
  from: BuildJobStatus[];
  to: BuildJobStatus;
  progressNote?: string;
}): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const row: Record<string, unknown> = {
    status: opts.to,
    updated_at: new Date().toISOString(),
  };
  if (opts.progressNote !== undefined) row.progress_note = opts.progressNote;
  const { data, error } = await admin
    .from("ai_tasks")
    .update(row)
    .eq("id", opts.jobId)
    .in("status", opts.from)
    .select("id");
  if (error) return false;
  return Array.isArray(data) && data.length > 0;
}

export async function appendBuildJobEvents(
  jobId: string,
  events: BuildJobEvent[],
): Promise<number> {
  if (!events.length) return 0;
  const admin = createSupabaseAdminClient();
  const rows = events.map((e) => ({
    job_id: jobId,
    seq: e.seq,
    kind: String(e.kind).slice(0, 40),
    message: String(e.message ?? "").slice(0, 2000),
    payload: e.payload ?? {},
    created_at: e.ts ?? new Date().toISOString(),
  }));
  const { error } = await admin
    .from("build_job_events")
    .upsert(rows, { onConflict: "job_id,seq", ignoreDuplicates: true });
  if (error) {
    console.warn("[cander:build-job] append events failed", error.message);
    return 0;
  }
  return rows.length;
}

export async function listBuildJobEvents(opts: {
  jobId: string;
  afterSeq?: number;
  limit?: number;
}): Promise<BuildJobEvent[]> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("build_job_events")
    .select("seq, kind, message, payload, created_at")
    .eq("job_id", opts.jobId)
    .gt("seq", opts.afterSeq ?? 0)
    .order("seq", { ascending: true })
    .limit(Math.min(opts.limit ?? 200, 500));
  return (data ?? []).map((r) => ({
    seq: Number(r.seq),
    kind: String(r.kind),
    message: String(r.message ?? ""),
    payload: (r.payload ?? {}) as Record<string, unknown>,
    ts: String(r.created_at),
  }));
}
