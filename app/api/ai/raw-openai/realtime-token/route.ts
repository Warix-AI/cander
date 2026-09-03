/**
 * Mint an ephemeral OpenAI Realtime client secret for live dictation.
 * POST /api/ai/raw-openai/realtime-token
 */

import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import {
  enforceUsageForRequest,
  finalizeUsageReservation,
} from "@/lib/usage/server/guard-route";

export const runtime = "nodejs";

const LIVE_MODEL = "gpt-live-transcribe";

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

  const idempotencyKey =
    request.headers.get("Idempotency-Key")?.trim() ||
    `realtime-dictation:${auth.user.id}:${Math.floor(Date.now() / 30_000)}`;

  const usage = await enforceUsageForRequest({
    request,
    feature: "audio_realtime",
    idempotencyKey,
    estimatedUnits: 1,
    provider: "openai",
    model: LIVE_MODEL,
    metadata: { mode: "realtime_transcription" },
  });
  if (!usage.ok) return usage.response;

  try {
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
            type: "transcription",
            audio: {
              input: {
                format: {
                  type: "audio/pcm",
                  rate: 24000,
                },
                transcription: {
                  model: LIVE_MODEL,
                  // Prefer accuracy over showing partials — we hide UI text anyway.
                  delay: "medium",
                },
                // Manual commit on stop so one final transcript lands when they finish.
                turn_detection: null,
              },
            },
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
      await finalizeUsageReservation({
        reservationId: usage.reservationId,
        status: "failed",
      });
      const message =
        data.error?.message ||
        `Could not create realtime session (${response.status}).`;
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
      await finalizeUsageReservation({
        reservationId: usage.reservationId,
        status: "failed",
      });
      return NextResponse.json(
        {
          error: "Realtime session response missing client secret.",
          latencyMs: Date.now() - started,
        },
        { status: 502 },
      );
    }

    await finalizeUsageReservation({
      reservationId: usage.reservationId,
      status: "confirmed",
      actualUnits: 1,
    });

    return NextResponse.json({
      clientSecret,
      model: LIVE_MODEL,
      expiresAt: data.expires_at ?? null,
      latencyMs: Date.now() - started,
    });
  } catch (e) {
    await finalizeUsageReservation({
      reservationId: usage.reservationId,
      status: "failed",
    });
    const message = e instanceof Error ? e.message : "realtime_token_failed";
    return NextResponse.json(
      { error: message.slice(0, 500), latencyMs: Date.now() - started },
      { status: 502 },
    );
  }
}
