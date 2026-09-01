/**
 * POST /api/ai/raw-openai/transcribe
 * Audio blob → OpenAI transcription → text (no audio persistence).
 */

import { NextResponse } from "next/server";
import OpenAI from "openai";
import { toFile } from "openai/uploads";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import { validateUpload } from "@/lib/ai/raw-openai/limits";
import {
  enforceUsageForRequest,
  finalizeUsageReservation,
} from "@/lib/usage/server/guard-route";

export const runtime = "nodejs";

function resolveTranscriptionModel(): string {
  return (
    process.env.OPENAI_TRANSCRIPTION_MODEL?.trim() || "gpt-transcribe"
  );
}

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
      { error: "OPENAI_API_KEY is not configured.", latencyMs: Date.now() - started },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart form data.", latencyMs: Date.now() - started },
      { status: 400 },
    );
  }

  const file = form.get("file") ?? form.get("audio");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "file field required.", latencyMs: Date.now() - started },
      { status: 400 },
    );
  }

  const mime = file.type || "audio/webm";
  const validated = validateUpload({ mime, size: file.size, hint: "audio" });
  if (!validated.ok || validated.kind !== "audio") {
    return NextResponse.json(
      {
        error: validated.ok
          ? "Expected an audio file."
          : validated.error,
        latencyMs: Date.now() - started,
      },
      { status: 400 },
    );
  }

  const model = resolveTranscriptionModel();

  const idempotencyKey =
    request.headers.get("Idempotency-Key")?.trim() ||
    `transcribe:${auth.user.id}:${file.size}:${file.name}`;
  const usage = await enforceUsageForRequest({
    request,
    feature: "audio_realtime",
    idempotencyKey,
    estimatedUnits: 1,
    provider: "openai",
    model,
    metadata: { mime, size: file.size },
  });
  if (!usage.ok) {
    return usage.response;
  }

  try {
    const client = new OpenAI({ apiKey });
    const bytes = Buffer.from(await file.arrayBuffer());
    const result = await client.audio.transcriptions.create({
      file: await toFile(bytes, file.name || "dictation.webm", { type: mime }),
      model,
    });

    const text =
      typeof result === "string"
        ? result
        : typeof (result as { text?: string }).text === "string"
          ? (result as { text: string }).text
          : "";

    console.log("[RAW_OPENAI_TRACE]", {
      mode: "transcribe",
      model,
      success: true,
      chars: text.length,
      latencyMs: Date.now() - started,
    });

    await finalizeUsageReservation({
      reservationId: usage.reservationId,
      status: "confirmed",
      actualUnits: 1,
    });

    return NextResponse.json({
      text: text.trim(),
      model,
      latencyMs: Date.now() - started,
    });
  } catch (e) {
    await finalizeUsageReservation({
      reservationId: usage.reservationId,
      status: "failed",
    });
    const message = e instanceof Error ? e.message : "transcribe_failed";
    console.log("[RAW_OPENAI_TRACE]", {
      mode: "transcribe",
      model,
      success: false,
      error: message.slice(0, 300),
      latencyMs: Date.now() - started,
    });
    return NextResponse.json(
      { error: message.slice(0, 500), model, latencyMs: Date.now() - started },
      { status: 502 },
    );
  }
}
