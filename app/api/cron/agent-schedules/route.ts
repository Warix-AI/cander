/**
 * POST /api/cron/agent-schedules
 * Vercel cron tick — claim due agents and run them.
 */

import { NextResponse } from "next/server";
import {
  claimDueScheduledAgents,
  clearScheduleClaim,
  runAgent,
} from "@/lib/agents/runtime";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorizeCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    // Dev fallback: allow when unset only in non-production
    return process.env.NODE_ENV !== "production";
  }
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const headerSecret = request.headers.get("x-cron-secret")?.trim() || "";
  return bearer === secret || headerSecret === secret;
}

export async function POST(request: Request) {
  if (!authorizeCron(request)) {
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
