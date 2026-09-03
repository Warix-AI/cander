/**
 * POST /api/ai/speculate/warm — Tier 1 invisible warm-up.
 * Classifies route, validates auth/thread, caches warm handle. No model call.
 */

import { NextResponse } from "next/server";
import {
  assertThreadOwnedByUser,
  requireBearerUser,
} from "@/lib/ai/raw-openai/auth";
import { classifyKnowledgeRoute } from "@/lib/ai/simple-turn/knowledge-route";
import { putSpecWarm } from "@/lib/ai/composer-speculation/server-cache";
import { normalizeSpeculationText } from "@/lib/ai/composer-speculation/fingerprint";
import { isSupabaseConfigured } from "@/lib/data-backend";

export const runtime = "nodejs";

type Body = {
  speculateId?: string;
  gen?: number;
  workspaceId?: string | null;
  threadId?: string | null;
  text?: string;
  inputFingerprint?: string;
};

export async function POST(request: Request) {
  const started = Date.now();

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase not configured.", latencyMs: Date.now() - started },
      { status: 503 },
    );
  }

  const auth = await requireBearerUser(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error, latencyMs: Date.now() - started },
      { status: auth.status },
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

  const text = normalizeSpeculationText(body.text || "");
  const fingerprint = (body.inputFingerprint || "").trim();
  if (!text || !fingerprint) {
    return NextResponse.json(
      { error: "text and inputFingerprint required.", latencyMs: Date.now() - started },
      { status: 400 },
    );
  }

  const ownership = await assertThreadOwnedByUser(
    body.threadId,
    auth.user.id,
  );
  if (!ownership.ok) {
    return NextResponse.json(
      { error: ownership.error, latencyMs: Date.now() - started },
      { status: ownership.status },
    );
  }

  const route = classifyKnowledgeRoute(text);
  const warmHandle = `wh_${crypto.randomUUID().replace(/-/g, "")}`;

  putSpecWarm({
    warmHandle,
    userId: auth.user.id,
    threadId: body.threadId ?? null,
    workspaceId: body.workspaceId ?? null,
    inputFingerprint: fingerprint,
    route,
    textNorm: text,
  });

  return NextResponse.json({
    speculateId: body.speculateId ?? null,
    gen: body.gen ?? null,
    tier: 1 as const,
    route,
    warmHandle,
    inputFingerprint: fingerprint,
    expiresInMs: 60_000,
    latencyMs: Date.now() - started,
  });
}
