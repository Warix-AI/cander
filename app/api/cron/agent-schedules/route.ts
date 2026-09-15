/**
 * POST /api/cron/agent-schedules
 * Claim due scheduled agents and wake them (Agent ↔ Cander).
 */

import { NextResponse } from "next/server";
import {
  claimDueScheduledAgents,
  clearScheduleClaim,
  runAgent,
} from "@/lib/agents/runtime";
import {
  computeNextRunAt,
  computeScheduleRetryAt,
  scheduleIdempotencyKey,
} from "@/lib/agents/schedule";
import { getProjectAgent, updateProjectAgent } from "@/lib/agents/server";
import { authorizeCronRequest } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  if (!authorizeCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const claimed = await claimDueScheduledAgents(8);
  const results: Array<{
    agentId: string;
    ok: boolean;
    runId?: string;
    error?: string;
  }> = [];

  for (const row of claimed) {
    try {
      const result = await runAgent({
        agentId: row.agentId,
        workspaceId: row.workspaceId,
        projectId: row.projectId,
        profileId: row.createdBy,
        triggerType: "schedule",
        idempotencyKey: scheduleIdempotencyKey(row.agentId, row.dueAt),
      });
      const ok = result.run.status === "completed";
      results.push({
        agentId: row.agentId,
        ok,
        runId: result.run.id,
        error: result.run.error ?? undefined,
      });

      // Outer catch rarely fires (runAgent swallows); still ensure next_run_at.
      if (!ok && result.run.status === "failed") {
        const agent = await getProjectAgent(
          row.agentId,
          row.workspaceId,
          row.projectId,
        );
        if (agent?.trigger.type === "schedule") {
          const retried = Boolean(
            (result.run.triggerPayload as { scheduleRetry?: unknown })
              ?.scheduleRetry,
          );
          const next = retried
            ? computeNextRunAt(agent.trigger, new Date())
            : computeScheduleRetryAt(new Date());
          await updateProjectAgent(row.agentId, row.workspaceId, row.projectId, {
            nextRunAt: next ? next.toISOString() : null,
          });
        }
      }
    } catch (err) {
      results.push({
        agentId: row.agentId,
        ok: false,
        error: err instanceof Error ? err.message : "failed",
      });
      try {
        const agent = await getProjectAgent(
          row.agentId,
          row.workspaceId,
          row.projectId,
        );
        if (agent?.trigger.type === "schedule") {
          const next = computeScheduleRetryAt(new Date());
          await updateProjectAgent(row.agentId, row.workspaceId, row.projectId, {
            nextRunAt: next.toISOString(),
          });
        }
      } catch {
        /* ignore */
      }
    } finally {
      await clearScheduleClaim(row.agentId, row.workspaceId);
    }
  }

  return NextResponse.json({
    claimed: claimed.length,
    results,
  });
}

export async function GET(request: Request) {
  return POST(request);
}
