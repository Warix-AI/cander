/**
 * POST /api/ai/agent — server-authoritative multi-round agent loop.
 * Derives capability snapshot and tools server-side. Never trusts client tool state.
 */

import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { resolveConnectorRequest } from "@/lib/connectors/server-context";
import { assertThreadOwnedByUser } from "@/lib/ai/raw-openai/auth";
import {
  isAgentRuntimeV2Enabled,
  runAgentServerLoop,
  type AgentMessage,
} from "@/lib/ai/runtime/agent-loop-server";
import {
  enforceUsageForRequest,
  finalizeUsageReservation,
} from "@/lib/usage/server/guard-route";
import { resolveOpenAIModel } from "@/lib/ai/raw-openai/web-search";

export const runtime = "nodejs";

/** Lightweight enablement probe for the client (no secrets). */
export async function GET() {
  return NextResponse.json({
    enabled: isAgentRuntimeV2Enabled(),
    runtime: isAgentRuntimeV2Enabled() ? "agent-v2" : "legacy",
  });
}

type Body = {
  messages?: AgentMessage[];
  workspaceId?: string;
  threadId?: string | null;
  aiChatId?: string | null;
  title?: string;
  confirmedToolCallId?: string | null;
  selectedConnectionId?: string | null;
  selectedConnectionIds?: string[] | null;
  clientHint?: { etag?: string };
};

export async function POST(request: Request) {
  const started = Date.now();

  if (!isAgentRuntimeV2Enabled()) {
    return NextResponse.json(
      {
        error: "Agent runtime v2 is disabled (AI_AGENT_RUNTIME=legacy).",
        latencyMs: Date.now() - started,
      },
      { status: 503 },
    );
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase not configured.", latencyMs: Date.now() - started },
      { status: 503 },
    );
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON.", latencyMs: Date.now() - started },
      { status: 400 },
    );
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (!messages.length) {
    return NextResponse.json(
      { error: "messages[] required.", latencyMs: Date.now() - started },
      { status: 400 },
    );
  }

  const ctx = await resolveConnectorRequest({
    request,
    workspaceId: body.workspaceId,
  });
  if (!ctx.ok) {
    return NextResponse.json(
      { error: ctx.error, latencyMs: Date.now() - started },
      { status: ctx.status },
    );
  }

  const ownership = await assertThreadOwnedByUser(body.threadId, ctx.user.id);
  if (!ownership.ok) {
    return NextResponse.json(
      { error: ownership.error, latencyMs: Date.now() - started },
      { status: ownership.status },
    );
  }

  let usageReservationId: string | null = null;
  const usage = await enforceUsageForRequest({
    request,
    feature: "ai_chat",
    workspaceId: ctx.workspaceId,
    threadId: body.threadId,
    idempotencyKey: `agent:${ctx.user.id}:${body.threadId || "none"}:${started}`,
    estimatedUnits: 1,
    provider: "openai",
    model: resolveOpenAIModel(),
  });
  if (!usage.ok) {
    return usage.response;
  }
  usageReservationId = usage.reservationId;

  try {
    const result = await runAgentServerLoop({
      client: ctx.client,
      workspaceId: ctx.workspaceId,
      profileId: ctx.user.id,
      messages: messages.map((m) => ({
        role: m.role,
        content: String(m.content ?? ""),
      })),
      threadId: body.threadId,
      aiChatId: body.aiChatId,
      confirmedToolCallId: body.confirmedToolCallId,
      selectedConnectionId: body.selectedConnectionId,
      selectedConnectionIds: Array.isArray(body.selectedConnectionIds)
        ? body.selectedConnectionIds.map(String).filter(Boolean)
        : null,
    });

    await finalizeUsageReservation({
      reservationId: usageReservationId,
      status: "confirmed",
      actualUnits: 1,
    }).catch(() => {});

    return NextResponse.json({
      content: result.content,
      toolResults: result.toolResults,
      pause: result.pause ?? null,
      turnId: result.turnId,
      model: result.model,
      discoveryReason: result.discoveryReason,
      latencyMs: Date.now() - started,
      runtime: "agent-v2",
    });
  } catch (err) {
    await finalizeUsageReservation({
      reservationId: usageReservationId,
      status: "failed",
    }).catch(() => {});
    const message = err instanceof Error ? err.message : "Agent turn failed.";
    return NextResponse.json(
      { error: message.slice(0, 500), latencyMs: Date.now() - started },
      { status: 500 },
    );
  }
}
