/**
 * Create a GPT-Live-1 WebRTC session with client delegation.
 * POST /api/ai/raw-openai/realtime-conversation-token
 *
 * Body: { sdp, workspaceId?, voice? }
 * Returns: { sdp, sessionId, aiExecutionId, model, voice }
 *
 * AI-minute metering stays open until realtime-conversation-end.
 */

import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import { enforceUsageForRequest } from "@/lib/usage/server/guard-route";
import { reconcileUsage } from "@/lib/usage/enforce";
import {
  REALTIME_CONVERSATION_INSTRUCTIONS,
  REALTIME_CONVERSATION_MODEL,
} from "@/lib/voice/realtime-tools";
import {
  DEFAULT_LIVE_VOICE,
  isLiveVoiceId,
  type LiveVoiceId,
} from "@/lib/voice/live-voices";

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

  let body: {
    sdp?: string;
    workspaceId?: string;
    voice?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const sdp = typeof body.sdp === "string" ? body.sdp.trim() : "";
  if (!sdp) {
    return NextResponse.json(
      { error: "An SDP offer is required." },
      { status: 400 },
    );
  }

  const workspaceId =
    typeof body.workspaceId === "string"
      ? body.workspaceId.trim() || null
      : null;
  const voice: LiveVoiceId = isLiveVoiceId(body.voice)
    ? body.voice
    : DEFAULT_LIVE_VOICE;

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
    metadata: { mode: "gpt_live_client_delegation", voice },
  });
  if (!usage.ok) return usage.response;

  try {
    const response = await fetch("https://api.openai.com/v1/live/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Safety-Identifier": auth.user.id,
      },
      body: JSON.stringify({
        session: {
          model: LIVE_MODEL,
          instructions: REALTIME_CONVERSATION_INSTRUCTIONS,
          audio: {
            output: { voice },
          },
          // Client owns Candor's assistant/tools; GPT-Live only converses.
          delegation: { type: "client" },
        },
        transport: {
          type: "webrtc",
          sdp,
        },
      }),
    });

    const data = (await response.json().catch(() => ({}))) as {
      session?: { id?: string };
      transport?: { sdp?: string; type?: string };
      error?: { message?: string };
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
          metadata: { error: data.error?.message ?? "live_session_failed" },
        });
      } catch {
        /* best-effort */
      }
      const message =
        data.error?.message ||
        `Could not create Live session (${response.status}).`;
      return NextResponse.json(
        { error: message.slice(0, 500), latencyMs: Date.now() - started },
        { status: 502 },
      );
    }

    const answerSdp =
      typeof data.transport?.sdp === "string" ? data.transport.sdp : null;
    const sessionId =
      typeof data.session?.id === "string" ? data.session.id : null;

    if (!answerSdp || !sessionId) {
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
          metadata: { error: "missing_live_session_answer" },
        });
      } catch {
        /* best-effort */
      }
      return NextResponse.json(
        {
          error: "Live session response missing SDP answer.",
          latencyMs: Date.now() - started,
        },
        { status: 502 },
      );
    }

    await reconcileUsage({
      reservationId: usage.reservationId,
      status: "confirmed",
      actualUnits: 1,
    });

    return NextResponse.json({
      sdp: answerSdp,
      sessionId,
      model: LIVE_MODEL,
      voice,
      aiExecutionId: usage.aiExecutionId ?? usage.reservationId,
      workspaceId: usage.workspaceId,
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
