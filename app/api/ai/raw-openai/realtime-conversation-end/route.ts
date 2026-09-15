/**
 * Finish wall-clock AI-minute metering for a Live conversation session.
 * POST /api/ai/raw-openai/realtime-conversation-end
 */

import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import { finishAIUsageExecution } from "@/lib/usage/ai-minutes/index";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const started = Date.now();

  const auth = await requireBearerUser(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error, latencyMs: Date.now() - started },
      { status: auth.status },
    );
  }

  let body: {
    aiExecutionId?: string;
    status?: "completed" | "cancelled" | "failed" | "interrupted";
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const aiExecutionId = body.aiExecutionId?.trim();
  if (!aiExecutionId) {
    return NextResponse.json(
      { error: "aiExecutionId is required." },
      { status: 400 },
    );
  }

  const status = body.status ?? "completed";

  try {
    await finishAIUsageExecution({
      executionId: aiExecutionId,
      status,
      userId: auth.user.id,
      metadata: {
        mode: "realtime_conversation",
        endedBy: "client",
        unit: "seconds",
      },
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Could not finish voice session metering.";
    return NextResponse.json(
      { error: message.slice(0, 500), latencyMs: Date.now() - started },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    latencyMs: Date.now() - started,
  });
}
