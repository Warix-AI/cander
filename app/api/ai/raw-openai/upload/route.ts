/**
 * POST /api/ai/raw-openai/upload
 * Multipart file → OpenAI Files API → chat_attachments row.
 */

import { NextResponse } from "next/server";
import OpenAI from "openai";
import { toFile } from "openai/uploads";
import { assertThreadOwnedByUser, requireBearerUser } from "@/lib/ai/raw-openai/auth";
import { isRawOpenAIModeAllowedOnServer } from "@/lib/ai/raw-openai/flags";
import { validateUpload } from "@/lib/ai/raw-openai/limits";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function newId(): string {
  return `att_${crypto.randomUUID().replace(/-/g, "")}`;
}

export async function POST(request: Request) {
  const started = Date.now();

  if (!isRawOpenAIModeAllowedOnServer()) {
    return NextResponse.json(
      { error: "Raw OpenAI mode is disabled.", latencyMs: Date.now() - started },
      { status: 403 },
    );
  }

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

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "file field required.", latencyMs: Date.now() - started },
      { status: 400 },
    );
  }

  const threadId = String(form.get("threadId") || "").trim() || null;
  const hint = String(form.get("attachmentType") || form.get("type") || "").trim();
  const mime = file.type || "application/octet-stream";

  const ownership = await assertThreadOwnedByUser(threadId, auth.user.id);
  if (!ownership.ok) {
    return NextResponse.json(
      { error: ownership.error, latencyMs: Date.now() - started },
      { status: ownership.status },
    );
  }

  const validated = validateUpload({ mime, size: file.size, hint });
  if (!validated.ok) {
    return NextResponse.json(
      { error: validated.error, latencyMs: Date.now() - started },
      { status: 400 },
    );
  }

  // Dictation audio should use /transcribe — reject audio here
  if (validated.kind === "audio") {
    return NextResponse.json(
      {
        error: "Audio uploads use /api/ai/raw-openai/transcribe.",
        latencyMs: Date.now() - started,
      },
      { status: 400 },
    );
  }

  try {
    const client = new OpenAI({ apiKey });
    const bytes = Buffer.from(await file.arrayBuffer());
    const openaiFile = await client.files.create({
      file: await toFile(bytes, file.name || "upload", { type: mime }),
      purpose: "user_data",
    });

    const id = newId();
    const row = {
      id,
      user_id: auth.user.id,
      thread_id: threadId,
      message_id: null as string | null,
      filename: file.name || "upload",
      mime_type: mime,
      size: file.size,
      attachment_type: validated.kind,
      openai_file_id: openaiFile.id,
    };

    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("chat_attachments").insert(row);
    if (error) {
      console.log("[RAW_OPENAI_TRACE]", {
        mode: "upload",
        success: false,
        error: error.message.slice(0, 300),
        latencyMs: Date.now() - started,
      });
      return NextResponse.json(
        {
          error: "Failed to persist attachment metadata.",
          latencyMs: Date.now() - started,
        },
        { status: 500 },
      );
    }

    console.log("[RAW_OPENAI_TRACE]", {
      mode: "upload",
      success: true,
      attachmentType: validated.kind,
      size: file.size,
      latencyMs: Date.now() - started,
    });

    return NextResponse.json({
      id,
      openaiFileId: openaiFile.id,
      attachmentType: validated.kind,
      filename: row.filename,
      mimeType: mime,
      size: file.size,
      latencyMs: Date.now() - started,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "upload_failed";
    console.log("[RAW_OPENAI_TRACE]", {
      mode: "upload",
      success: false,
      error: message.slice(0, 300),
      latencyMs: Date.now() - started,
    });
    return NextResponse.json(
      { error: message.slice(0, 500), latencyMs: Date.now() - started },
      { status: 502 },
    );
  }
}

/** PATCH: link attachment rows to a message_id after send. */
export async function PATCH(request: Request) {
  const started = Date.now();
  const auth = await requireBearerUser(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error, latencyMs: Date.now() - started },
      { status: auth.status },
    );
  }

  let body: { attachmentIds?: string[]; messageId?: string; threadId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const ids = Array.isArray(body.attachmentIds) ? body.attachmentIds : [];
  const messageId = (body.messageId || "").trim();
  if (!ids.length || !messageId) {
    return NextResponse.json(
      { error: "attachmentIds[] and messageId required." },
      { status: 400 },
    );
  }

  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin
      .from("chat_attachments")
      .update({
        message_id: messageId,
        ...(body.threadId ? { thread_id: body.threadId } : {}),
      })
      .in("id", ids)
      .eq("user_id", auth.user.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, linked: ids.length });
  } catch (e) {
    const message = e instanceof Error ? e.message : "link_failed";
    return NextResponse.json({ error: message.slice(0, 300) }, { status: 500 });
  }
}
