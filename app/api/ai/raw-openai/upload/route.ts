/**
 * POST /api/ai/raw-openai/upload
 * Multipart file → OpenAI Files API → chat_attachments row (pending until linked).
 */

import { NextResponse } from "next/server";
import { assertThreadOwnedByUser, requireBearerUser } from "@/lib/ai/raw-openai/auth";
import { isRawOpenAIModeAllowedOnServer } from "@/lib/ai/raw-openai/flags";
import { validateUpload } from "@/lib/ai/raw-openai/limits";
import {
  createOpenAIMediaClient,
  uploadFileToOpenAI,
} from "@/lib/ai/raw-openai/media-provider";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function newId(): string {
  return `att_${crypto.randomUUID().replace(/-/g, "")}`;
}

function asUploadBlob(
  value: FormDataEntryValue | null,
): { blob: Blob; filename: string; mime: string } | null {
  if (!value || typeof value === "string") return null;
  // Node/undici may yield File or Blob depending on runtime.
  if (!(value instanceof Blob)) return null;
  const filename =
    value instanceof File && value.name
      ? value.name
      : "upload";
  const mime =
    (value.type && value.type.trim()) || "application/octet-stream";
  return { blob: value, filename, mime };
}

/** Only store thread_id when the threads row exists (avoids orphan refs). */
async function resolvePersistedThreadId(
  threadId: string | null,
  userId: string,
): Promise<string | null> {
  if (!threadId) return null;
  try {
    const admin = createSupabaseAdminClient();
    const { data } = await admin
      .from("threads")
      .select("id, created_by")
      .eq("id", threadId)
      .maybeSingle();
    if (!data) return null;
    if (data.created_by && data.created_by !== userId) return null;
    return data.id as string;
  } catch {
    return null;
  }
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

  const parsed = asUploadBlob(form.get("file"));
  if (!parsed) {
    return NextResponse.json(
      { error: "file field required (bytes).", latencyMs: Date.now() - started },
      { status: 400 },
    );
  }

  const requestedThreadId = String(form.get("threadId") || "").trim() || null;
  const hint = String(form.get("attachmentType") || form.get("type") || "").trim();
  const mime = parsed.mime;

  const ownership = await assertThreadOwnedByUser(
    requestedThreadId,
    auth.user.id,
  );
  if (!ownership.ok) {
    return NextResponse.json(
      { error: ownership.error, latencyMs: Date.now() - started },
      { status: ownership.status },
    );
  }

  const validated = validateUpload({
    mime,
    size: parsed.blob.size,
    hint,
  });
  if (!validated.ok) {
    return NextResponse.json(
      { error: validated.error, latencyMs: Date.now() - started },
      { status: 400 },
    );
  }

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
    const bytes = Buffer.from(await parsed.blob.arrayBuffer());
    const client = createOpenAIMediaClient(apiKey);
    const { openaiFileId } = await uploadFileToOpenAI(client, {
      filename: parsed.filename,
      mimeType: mime,
      byteLength: bytes.byteLength,
      bytes,
      type: validated.kind,
    });

    const persistedThreadId = await resolvePersistedThreadId(
      requestedThreadId,
      auth.user.id,
    );

    const id = newId();
    const row = {
      id,
      user_id: auth.user.id,
      thread_id: persistedThreadId,
      message_id: null as string | null,
      filename: parsed.filename || "upload",
      mime_type: mime,
      size: bytes.byteLength,
      attachment_type: validated.kind,
      openai_file_id: openaiFileId,
      status: "pending" as const,
    };

    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("chat_attachments").insert(row);
    if (error) {
      console.log("[RAW_OPENAI_TRACE]", {
        mode: "upload",
        success: false,
        error: error.message.slice(0, 300),
        code: error.code,
        details: error.details?.slice?.(0, 200),
        latencyMs: Date.now() - started,
      });
      return NextResponse.json(
        {
          error: "Failed to persist attachment metadata.",
          detail: error.message.slice(0, 300),
          code: error.code,
          latencyMs: Date.now() - started,
        },
        { status: 500 },
      );
    }

    console.log("[RAW_OPENAI_TRACE]", {
      mode: "upload",
      success: true,
      attachmentType: validated.kind,
      size: bytes.byteLength,
      threadPersisted: Boolean(persistedThreadId),
      latencyMs: Date.now() - started,
    });

    return NextResponse.json({
      id,
      openaiFileId,
      attachmentType: validated.kind,
      filename: row.filename,
      mimeType: mime,
      size: bytes.byteLength,
      status: "pending",
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

/** PATCH: link attachment rows to a message_id after send (pending → attached). */
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
    const persistedThreadId = body.threadId
      ? await resolvePersistedThreadId(body.threadId, auth.user.id)
      : null;
    const { error } = await admin
      .from("chat_attachments")
      .update({
        message_id: messageId,
        status: "attached",
        ...(persistedThreadId ? { thread_id: persistedThreadId } : {}),
      })
      .in("id", ids)
      .eq("user_id", auth.user.id);
    if (error) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, linked: ids.length });
  } catch (e) {
    const message = e instanceof Error ? e.message : "link_failed";
    return NextResponse.json({ error: message.slice(0, 300) }, { status: 500 });
  }
}
