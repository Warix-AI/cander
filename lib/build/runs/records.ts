/**
 * Agent run records (server-only). Every build job has one `build_runs` row
 * (id = job id) with lifecycle status, base/result SHAs, failure class and
 * metering; tool calls land in `build_run_tool_calls` redacted (tool name,
 * paths, short summary — never file bodies, secrets or raw output).
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { BuildJob, BuildJobEvent, BuildJobFailure } from "@/lib/build/jobs/store";

export type BuildRunStatus = "queued" | "planning" | "editing" | "testing" | "fixing" | "verifying" | "complete" | "failed" | "canceled";
type RunKind = "create" | "edit" | "repair" | "publish_fix" | "verify";

/** USD per 1M tokens (input, output). Kept conservative; used for estimates only. */
const PRICING: Array<{ match: RegExp; input: number; output: number }> = [
  { match: /codex/i, input: 1.5, output: 6 },
  { match: /luna|gpt-5/i, input: 1.25, output: 10 },
  { match: /mini|nano/i, input: 0.25, output: 2 },
];

export function estimateCostUsd(opts: { model: string | null | undefined; inputTokens: number; outputTokens: number }): number {
  const model = opts.model ?? "";
  const price = PRICING.find((p) => p.match.test(model)) ?? { input: 2, output: 8 };
  return Number(((opts.inputTokens / 1e6) * price.input + (opts.outputTokens / 1e6) * price.output).toFixed(6));
}

function runKind(job: BuildJob): RunKind {
  if (job.facts.publishFix) return "publish_fix";
  if (job.facts.resume?.phase === "verify") return "verify";
  if (job.facts.resume) return "repair";
  return job.facts.mode === "create" ? "create" : "edit";
}

export async function ensureBuildRun(job: BuildJob, baseSha: string | null): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("build_runs").upsert(
    {
      id: job.id,
      build_job_id: job.id,
      workspace_id: job.workspaceId,
      project_id: job.projectId,
      user_id: job.facts.userId ?? null,
      kind: runKind(job),
      status: "queued",
      instruction: (job.facts.instruction ?? job.goal ?? "").slice(0, 4000) || null,
      base_sha: baseSha,
      started_at: new Date().toISOString(),
    },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (error) console.warn("[cander:runs] ensure failed", error.message);
}

export async function setBuildRunStatus(jobId: string, status: BuildRunStatus): Promise<void> {
  const admin = createSupabaseAdminClient();
  await admin
    .from("build_runs")
    .update({ status })
    .eq("id", jobId)
    .not("status", "in", "(complete,failed,canceled)")
    .then(({ error }) => error && console.warn("[cander:runs] status failed", error.message));
}

/** Map builder status lines onto run lifecycle states. */
export function runStatusFromEvents(events: BuildJobEvent[]): BuildRunStatus | null {
  let status: BuildRunStatus | null = null;
  for (const e of events) {
    if (e.kind !== "status") continue;
    const m = e.message.toLowerCase();
    if (m.startsWith("planning")) status = "planning";
    else if (m.startsWith("building") || m.startsWith("making") || m.startsWith("editing")) status = "editing";
    else if (m.startsWith("verifying") || m.startsWith("checking")) status = "testing";
    else if (m.startsWith("repairing") || m.startsWith("fixing")) status = "fixing";
    else if (m.startsWith("saving") || m.startsWith("starting the preview") || m.startsWith("preparing preview")) status = "verifying";
  }
  return status;
}

type ToolCallPayload = { tool?: string; ok?: boolean; durationMs?: number; paths?: unknown; summary?: string };

/** Persist redacted tool-call events. Idempotent per (run, seq). */
export async function recordRunToolCalls(job: BuildJob, events: BuildJobEvent[]): Promise<void> {
  const rows = events
    .filter((e) => e.kind === "tool_call")
    .map((e) => {
      const p = (e.payload ?? {}) as ToolCallPayload;
      const paths = Array.isArray(p.paths) ? p.paths.map((x) => String(x).slice(0, 300)).slice(0, 20) : [];
      return {
        run_id: job.id,
        workspace_id: job.workspaceId,
        seq: e.seq,
        tool: String(p.tool ?? e.message ?? "tool").slice(0, 80),
        summary: p.summary ? String(p.summary).slice(0, 300) : null,
        paths,
        ok: typeof p.ok === "boolean" ? p.ok : null,
        duration_ms: typeof p.durationMs === "number" ? Math.round(p.durationMs) : null,
      };
    });
  if (!rows.length) return;
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("build_run_tool_calls").upsert(rows, { onConflict: "run_id,seq", ignoreDuplicates: true });
  if (error) console.warn("[cander:runs] tool calls failed", error.message);
}

export async function finishBuildRun(
  job: BuildJob,
  outcome: {
    status: "complete" | "failed" | "canceled";
    resultSha: string | null;
    summary?: string | null;
    failure?: BuildJobFailure | null;
    stats?: Record<string, unknown> | null;
  },
): Promise<void> {
  const stats = outcome.stats ?? (job.facts.stats as Record<string, unknown> | undefined) ?? {};
  const inputTokens = Number(stats.inputTokens ?? 0);
  const outputTokens = Number(stats.outputTokens ?? 0);
  const failureKind = outcome.failure?.kind && ["infra", "app", "budget", "agent", "unknown"].includes(outcome.failure.kind) ? outcome.failure.kind : outcome.status === "failed" ? "unknown" : null;
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("build_runs")
    .update({
      status: outcome.status,
      result_sha: outcome.resultSha,
      summary: outcome.summary?.slice(0, 2000) ?? null,
      failure_kind: failureKind,
      failure_reason: outcome.failure?.reason ?? null,
      llm_calls: Number(stats.llmCalls ?? 0),
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      tool_calls: Number(stats.toolCalls ?? 0),
      files_touched: Number(stats.filesTouched ?? 0),
      estimated_cost_usd: estimateCostUsd({ model: job.facts.models?.coder, inputTokens, outputTokens }),
      finished_at: new Date().toISOString(),
    })
    .eq("id", job.id);
  if (error) console.warn("[cander:runs] finish failed", error.message);
}
