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
import { scheduleIdempotencyKey } from "@/lib/agents/schedule";
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
      results.push({
        agentId: row.agentId,
        ok: result.run.status === "completed",
        runId: result.run.id,
        error: result.run.error ?? undefined,
      });
    } catch (err) {
      results.push({
        agentId: row.agentId,
        ok: false,
        error: err instanceof Error ? err.message : "failed",
      });
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
