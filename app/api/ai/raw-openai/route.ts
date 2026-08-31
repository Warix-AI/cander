/**
 * Server-only Raw OpenAI Responses API (multimodal).
 * OPENAI_API_KEY must never appear in client bundles.
 */

import { NextResponse } from "next/server";
import OpenAI from "openai";
import {
  assertThreadOwnedByUser,
  requireBearerUser,
} from "@/lib/ai/raw-openai/auth";
import {
  buildRawOpenAIInput,
  type AttachmentRef,
  type ChatMsg,
} from "@/lib/ai/raw-openai/build-input";
import { isRawOpenAIModeAllowedOnServer } from "@/lib/ai/raw-openai/flags";
import { MAX_ATTACHMENTS_PER_TURN } from "@/lib/ai/raw-openai/limits";
import {
  didOpenAIUseWebSearch,
  isOpenAIWebSearchEnabled,
  resolveOpenAIModel,
} from "@/lib/ai/raw-openai/web-search";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type Body = {
  messages?: ChatMsg[];
  system?: string;
  images?: string[];
  attachmentIds?: string[];
  threadId?: string | null;
  title?: string;
};

export async function POST(request: Request) {
  const started = Date.now();

  if (!isRawOpenAIModeAllowedOnServer()) {
    return NextResponse.json(
      {
        error:
          "Raw OpenAI mode is disabled (RAW_OPENAI_MODE / NEXT_PUBLIC_RAW_OPENAI_MODE is off).",
        latencyMs: Date.now() - started,
      },
      { status: 403 },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "OPENAI_API_KEY is not configured on the server (.env.local / deployment secrets).",
        latencyMs: Date.now() - started,
      },
      { status: 503 },
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

  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (!messages.length) {
    return NextResponse.json(
      { error: "messages[] required.", latencyMs: Date.now() - started },
      { status: 400 },
    );
  }

  const attachmentIds = Array.isArray(body.attachmentIds)
    ? body.attachmentIds.filter((id) => typeof id === "string" && id.length > 0)
    : [];

  let userId: string | null = null;
  const needsAuth = attachmentIds.length > 0 || Boolean(body.threadId);
  if (needsAuth) {
    const auth = await requireBearerUser(request);
    if (attachmentIds.length && !auth.ok) {
      return NextResponse.json(
        { error: auth.error, latencyMs: Date.now() - started },
        { status: auth.status },
      );
    }
    if (auth.ok) {
      userId = auth.user.id;
      const ownership = await assertThreadOwnedByUser(body.threadId, userId);
      if (!ownership.ok) {
        return NextResponse.json(
          { error: ownership.error, latencyMs: Date.now() - started },
          { status: ownership.status },
        );
      }
    }
  }

  const model = resolveOpenAIModel();
  const webSearchEnabled = isOpenAIWebSearchEnabled();
  const system =
    (body.system || "").trim() ||
    "You are a helpful assistant. Answer clearly using the conversation history.";

  const attachmentRefs: AttachmentRef[] = [];

  if (userId) {
    try {
      const admin = createSupabaseAdminClient();

      if (attachmentIds.length) {
        if (attachmentIds.length > MAX_ATTACHMENTS_PER_TURN) {
          return NextResponse.json(
            {
              error: `Too many attachments (max ${MAX_ATTACHMENTS_PER_TURN}).`,
              latencyMs: Date.now() - started,
            },
            { status: 400 },
          );
        }
        const { data: current, error } = await admin
          .from("chat_attachments")
          .select(
            "id, openai_file_id, attachment_type, message_id, user_id",
          )
          .in("id", attachmentIds)
          .eq("user_id", userId);

        if (error) {
          return NextResponse.json(
            { error: "Failed to load attachments.", latencyMs: Date.now() - started },
            { status: 500 },
          );
        }
        const rows = current || [];
        if (rows.length !== attachmentIds.length) {
          return NextResponse.json(
            {
              error: "One or more attachments are not accessible.",
              latencyMs: Date.now() - started,
            },
            { status: 403 },
          );
        }
        for (const row of rows) {
          if (row.attachment_type === "audio") continue;
          attachmentRefs.push({
            id: row.id,
            openaiFileId: row.openai_file_id,
            attachmentType: row.attachment_type as "image" | "document",
            forCurrentTurn: true,
          });
        }
      }

      // Prior thread attachments for follow-ups
      if (body.threadId) {
        const { data: prior } = await admin
          .from("chat_attachments")
          .select("id, openai_file_id, attachment_type, message_id")
          .eq("user_id", userId)
          .eq("thread_id", body.threadId)
          .not("message_id", "is", null);

        const currentSet = new Set(attachmentIds);
        for (const row of prior || []) {
          if (currentSet.has(row.id)) continue;
          if (row.attachment_type === "audio") continue;
          attachmentRefs.push({
            id: row.id,
            openaiFileId: row.openai_file_id,
            attachmentType: row.attachment_type as "image" | "document",
            messageId: row.message_id,
          });
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "attachment_load_failed";
      return NextResponse.json(
        { error: message.slice(0, 300), latencyMs: Date.now() - started },
        { status: 500 },
      );
    }
  }

  const fallbackImages =
    attachmentRefs.some((a) => a.forCurrentTurn && a.attachmentType === "image")
      ? []
      : (body.images || []).filter((u) => typeof u === "string" && u.length > 0);

  const input = buildRawOpenAIInput({
    system,
    messages,
    attachments: attachmentRefs,
    fallbackImageUrls: fallbackImages,
  });

  const client = new OpenAI({ apiKey });
  const createParams: OpenAI.Responses.ResponseCreateParamsNonStreaming = {
    model,
    input: input as OpenAI.Responses.ResponseInput,
    ...(webSearchEnabled ? { tools: [{ type: "web_search" as const }] } : {}),
  };

  try {
    const response = await client.responses.create(createParams);

    const content =
      (typeof response.output_text === "string" && response.output_text) ||
      extractText(response) ||
      "";

    const usage = response.usage;
    const latencyMs = Date.now() - started;
    const webSearchUsed = didOpenAIUseWebSearch(response.output);

    console.log("[RAW_OPENAI_TRACE]", {
      provider: "openai",
      mode: "raw",
      model,
      webSearchEnabled,
      webSearchUsed,
      attachmentCount: attachmentRefs.filter((a) => a.forCurrentTurn).length,
      threadMessageCount: messages.length,
      inputTokens: usage?.input_tokens,
      outputTokens: usage?.output_tokens,
      latencyMs,
      success: true,
      threadId: body.threadId ?? undefined,
    });

    return NextResponse.json({
      content,
      model,
      webSearchEnabled,
      webSearchUsed,
      inputTokens: usage?.input_tokens,
      outputTokens: usage?.output_tokens,
      latencyMs,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "openai_error";
    const latencyMs = Date.now() - started;
    console.log("[RAW_OPENAI_TRACE]", {
      provider: "openai",
      mode: "raw",
      model,
      webSearchEnabled,
      webSearchUsed: false,
      threadMessageCount: messages.length,
      latencyMs,
      success: false,
      error: message.slice(0, 500),
    });
    return NextResponse.json(
      {
        error: message.slice(0, 500),
        model,
        webSearchEnabled,
        webSearchUsed: false,
        latencyMs,
      },
      { status: 502 },
    );
  }
}

function extractText(response: OpenAI.Responses.Response): string {
  const parts: string[] = [];
  for (const item of response.output || []) {
    if (item.type !== "message") continue;
    for (const c of item.content || []) {
      if (c.type === "output_text" && c.text) parts.push(c.text);
    }
  }
  return parts.join("\n").trim();
}
