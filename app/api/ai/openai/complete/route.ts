/**
 * POST /api/ai/openai/complete
 * Lightweight OpenAI chat completion for V6 cloud synthesis (FM-off default path).
 */

import { NextResponse } from "next/server";
import OpenAI from "openai";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import { resolveOpenAIModel } from "@/lib/ai/raw-openai/web-search";
import {
  enforceUsageForRequest,
  finalizeUsageReservation,
} from "@/lib/usage/server/guard-route";

export const runtime = "nodejs";

const DEFAULT_SYSTEM = `You are Cander. Write clear, natural user-facing answers from the provided resolved inputs only.
Do not invent facts, citations, or URLs. Mention any stated coverage gaps briefly.`;

type Body = {
  prompt?: string;
  system?: string;
};

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

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body.", latencyMs: Date.now() - started },
      { status: 400 },
    );
  }

  const prompt = (body.prompt || "").trim();
  if (!prompt) {
    return NextResponse.json(
      { error: "prompt is required.", latencyMs: Date.now() - started },
      { status: 400 },
    );
  }

  const model = resolveOpenAIModel();
  const idempotencyKey =
    request.headers.get("Idempotency-Key")?.trim() ||
    `openai-complete:${auth.user.id}:${prompt.length}:${prompt.slice(0, 40)}`;

  const usage = await enforceUsageForRequest({
    request,
    feature: "ai_chat",
    idempotencyKey,
    estimatedUnits: 1,
    provider: "openai",
    model,
    metadata: { kind: "v6_synthesis" },
  });
  if (!usage.ok) {
    return usage.response;
  }

  try {
    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: (body.system || DEFAULT_SYSTEM).trim() },
        { role: "user", content: prompt },
      ],
    });

    const text = completion.choices[0]?.message?.content?.trim() || "";

    await finalizeUsageReservation({
      reservationId: usage.reservationId,
      status: "confirmed",
      actualUnits: 1,
    });

    // #region agent log
    fetch("http://127.0.0.1:7521/ingest/0b7940f7-640a-4835-98e0-f86faa434abe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "20f195",
      },
      body: JSON.stringify({
        sessionId: "20f195",
        runId: "post-fix",
        hypothesisId: "H1",
        location: "openai/complete/route.ts:ok",
        message: "openai complete success",
        data: {
          model,
          textLen: text.length,
          latencyMs: Date.now() - started,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    return NextResponse.json({
      text,
      model,
      latencyMs: Date.now() - started,
    });
  } catch (e) {
    await finalizeUsageReservation({
      reservationId: usage.reservationId,
      status: "failed",
    });
    const message = e instanceof Error ? e.message : "openai_complete_failed";

    // #region agent log
    fetch("http://127.0.0.1:7521/ingest/0b7940f7-640a-4835-98e0-f86faa434abe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "20f195",
      },
      body: JSON.stringify({
        sessionId: "20f195",
        runId: "post-fix",
        hypothesisId: "H1",
        location: "openai/complete/route.ts:error",
        message: "openai complete failed",
        data: { model, error: message.slice(0, 300) },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    return NextResponse.json(
      { error: message.slice(0, 500), model, latencyMs: Date.now() - started },
      { status: 502 },
    );
  }
}
