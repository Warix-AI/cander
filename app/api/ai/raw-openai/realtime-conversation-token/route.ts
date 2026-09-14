/**
 * Mint an ephemeral OpenAI Realtime client secret for Live conversation.
 * POST /api/ai/raw-openai/realtime-conversation-token
 *
 * Does not overload the transcription-only realtime-token route.
 * AI-minute metering stays open until realtime-conversation-end.
 */

import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import { enforceUsageForRequest } from "@/lib/usage/server/guard-route";
import { reconcileUsage } from "@/lib/usage/enforce";
import { listActiveConnections } from "@/lib/connectors/connections";
import { createClient } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import {
  REALTIME_CONVERSATION_INSTRUCTIONS,
  REALTIME_CONVERSATION_MODEL,
  realtimeConversationTools,
} from "@/lib/voice/realtime-tools";

export const runtime = "nodejs";

const LIVE_MODEL = REALTIME_CONVERSATION_MODEL;

export async function POST(request: Request) {
  const started = Date.now();

  const auth = await requireBearerUser(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error, latencyMs: Date.now() - started },
      { status: auth.status },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      {
        error: "OPENAI_API_KEY is not configured.",
        latencyMs: Date.now() - started,
      },
      { status: 503 },
    );
  }

  let workspaceId: string | null = null;
  try {
    const body = (await request.json().catch(() => ({}))) as {
      workspaceId?: string;
    };
    workspaceId =
      typeof body.workspaceId === "string"
        ? body.workspaceId.trim() || null
        : null;
  } catch {
    workspaceId = null;
  }

  const idempotencyKey =
    request.headers.get("Idempotency-Key")?.trim() ||
    `realtime-conversation:${auth.user.id}:${Date.now()}`;

  const usage = await enforceUsageForRequest({
    request,
    feature: "audio_realtime",
    workspaceId,
    idempotencyKey,
    estimatedUnits: 1,
    provider: "openai",
    model: LIVE_MODEL,
    metadata: { mode: "realtime_conversation" },
  });
  if (!usage.ok) return usage.response;

  let connectorIds: string[] = [];
  try {
    const client = createClient(supabaseUrl(), supabaseAnonKey(), {
      global: { headers: { Authorization: `Bearer ${auth.token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const listed = await listActiveConnections({
      client,
      workspaceId: usage.workspaceId,
      profileId: auth.user.id,
    });
    if (listed.ok) {
      connectorIds = [
        ...new Set(listed.connections.map((c) => c.connectorId)),
      ];
    }
  } catch {
    connectorIds = [];
  }

  try {
    const tools = realtimeConversationTools({ connectorIds });
    const response = await fetch(
      "https://api.openai.com/v1/realtime/client_secrets",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "OpenAI-Safety-Identifier": auth.user.id,
        },
        body: JSON.stringify({
          session: {
            type: "realtime",
            model: LIVE_MODEL,
            instructions: REALTIME_CONVERSATION_INSTRUCTIONS,
            audio: {
              input: {
                format: { type: "audio/pcm", rate: 24000 },
                transcription: { model: "gpt-4o-mini-transcribe" },
                turn_detection: {
                  type: "server_vad",
                  create_response: true,
                  interrupt_response: true,
                },
              },
              output: {
                format: { type: "audio/pcm", rate: 24000 },
                voice: "alloy",
              },
            },
            tools,
            tool_choice: "auto",
          },
        }),
      },
    );

    const data = (await response.json().catch(() => ({}))) as {
      value?: string;
      client_secret?: { value?: string };
      error?: { message?: string };
      expires_at?: number;
    };

    if (!response.ok) {
      await reconcileUsage({
        reservationId: usage.reservationId,
        status: "failed",
      });
      const { finishAIUsageExecution } = await import(
        "@/lib/usage/ai-minutes/index"
      );
      try {
        await finishAIUsageExecution({
          executionId: usage.aiExecutionId ?? usage.reservationId,
          status: "failed",
          metadata: { error: data.error?.message ?? "client_secret_failed" },
        });
      } catch {
        /* best-effort */
      }
      const message =
        data.error?.message ||
        `Could not create realtime conversation session (${response.status}).`;
      return NextResponse.json(
        { error: message.slice(0, 500), latencyMs: Date.now() - started },
        { status: 502 },
      );
    }

    const clientSecret =
      (typeof data.value === "string" && data.value) ||
      (typeof data.client_secret?.value === "string" &&
        data.client_secret.value) ||
      null;

    if (!clientSecret) {
      await reconcileUsage({
        reservationId: usage.reservationId,
        status: "failed",
      });
      const { finishAIUsageExecution } = await import(
        "@/lib/usage/ai-minutes/index"
      );
      try {
        await finishAIUsageExecution({
          executionId: usage.aiExecutionId ?? usage.reservationId,
          status: "failed",
          metadata: { error: "missing_client_secret" },
        });
      } catch {
        /* best-effort */
      }
      return NextResponse.json(
        {
          error: "Realtime session response missing client secret.",
          latencyMs: Date.now() - started,
        },
        { status: 502 },
      );
    }

    // Confirm request/$ reservation, but leave AI minutes running until end.
    await reconcileUsage({
      reservationId: usage.reservationId,
      status: "confirmed",
      actualUnits: 1,
    });

    return NextResponse.json({
      clientSecret,
      model: LIVE_MODEL,
      aiExecutionId: usage.aiExecutionId ?? usage.reservationId,
      workspaceId: usage.workspaceId,
      toolCount: tools.length,
      expiresAt: data.expires_at ?? null,
      latencyMs: Date.now() - started,
    });
  } catch (e) {
    await reconcileUsage({
      reservationId: usage.reservationId,
      status: "failed",
    });
    const { finishAIUsageExecution } = await import(
      "@/lib/usage/ai-minutes/index"
    );
    try {
      await finishAIUsageExecution({
        executionId: usage.aiExecutionId ?? usage.reservationId,
        status: "failed",
        metadata: {
          error:
            e instanceof Error ? e.message : "realtime_conversation_failed",
        },
      });
    } catch {
      /* best-effort */
    }
    const message =
      e instanceof Error ? e.message : "realtime_conversation_failed";
    return NextResponse.json(
      { error: message.slice(0, 500), latencyMs: Date.now() - started },
      { status: 502 },
    );
  }
}
