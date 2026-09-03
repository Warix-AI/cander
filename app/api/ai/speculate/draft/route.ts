/**
 * POST /api/ai/speculate/draft — Tier 2 no-tools draft (never committed to chat).
 * Allowed for LOCAL + UNCERTAIN. Skips WEB_REQUIRED. Tools/web search forced off.
 */

import { NextResponse } from "next/server";
import OpenAI from "openai";
import {
  assertThreadOwnedByUser,
  requireBearerUser,
} from "@/lib/ai/raw-openai/auth";
import { resolveOpenAIModel } from "@/lib/ai/raw-openai/web-search";
import {
  allowSpecDraft,
  getSpecWarm,
  putSpecDraft,
} from "@/lib/ai/composer-speculation/server-cache";
import { normalizeSpeculationText } from "@/lib/ai/composer-speculation/fingerprint";
import { isSupabaseConfigured } from "@/lib/data-backend";

export const runtime = "nodejs";

const DRAFT_INSTRUCTIONS = `You are Cander. The user is still composing; produce a short, direct draft answer to their current text as if they already sent it. Be concise. Do not mention speculation, drafts, or that the message is incomplete. No tools.`;

type Body = {
  speculateId?: string;
  gen?: number;
  warmHandle?: string;
  workspaceId?: string | null;
  threadId?: string | null;
  text?: string;
  inputFingerprint?: string;
};

export async function POST(request: Request) {
  const started = Date.now();

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY not configured.", latencyMs: Date.now() - started },
      { status: 503 },
    );
  }

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

  const warmHandle = (body.warmHandle || "").trim();
  const fingerprint = (body.inputFingerprint || "").trim();
  const text = normalizeSpeculationText(body.text || "");
  if (!warmHandle || !fingerprint || !text) {
    return NextResponse.json(
      {
        error: "warmHandle, text, and inputFingerprint required.",
        latencyMs: Date.now() - started,
      },
      { status: 400 },
    );
  }

  const warm = getSpecWarm(warmHandle);
  if (!warm || warm.userId !== auth.user.id) {
    return NextResponse.json(
      { error: "Warm handle expired or invalid.", latencyMs: Date.now() - started },
      { status: 404 },
    );
  }
  if (warm.inputFingerprint !== fingerprint) {
    return NextResponse.json(
      { error: "Fingerprint mismatch.", latencyMs: Date.now() - started },
      { status: 409 },
    );
  }
  if (warm.route === "WEB_REQUIRED") {
    return NextResponse.json({
      skipped: true,
      reason: "route_web_required",
      route: warm.route,
      latencyMs: Date.now() - started,
    });
  }

  if (!allowSpecDraft(auth.user.id)) {
    return NextResponse.json({
      skipped: true,
      reason: "rate_limited",
      latencyMs: Date.now() - started,
    });
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

  const model = resolveOpenAIModel();
  try {
    const client = new OpenAI({ apiKey });
    const response = await client.responses.create({
      model,
      instructions: DRAFT_INSTRUCTIONS,
      input: text,
      // Explicitly no tools / no web_search.
    });
    const draftText = (response.output_text || "").trim();
    if (!draftText) {
      return NextResponse.json({
        skipped: true,
        reason: "empty_draft",
        latencyMs: Date.now() - started,
      });
    }

    putSpecDraft({
      warmHandle,
      userId: auth.user.id,
      inputFingerprint: fingerprint,
      draftText,
      model,
    });

    return NextResponse.json({
      speculateId: body.speculateId ?? null,
      gen: body.gen ?? null,
      tier: 2 as const,
      draftText,
      inputFingerprint: fingerprint,
      warmHandle,
      model,
      latencyMs: Date.now() - started,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message.slice(0, 200) : "draft_failed";
    return NextResponse.json(
      { error: message, latencyMs: Date.now() - started },
      { status: 502 },
    );
  }
}
