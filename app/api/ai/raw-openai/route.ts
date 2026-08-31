/**
 * Server-only Raw OpenAI Responses API (multimodal + optional image generation).
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
import {
  isOpenAIImageGenerationEnabled,
  openAIImageGenerationTool,
} from "@/lib/ai/raw-openai/image-generation";
import { MAX_ATTACHMENTS_PER_TURN } from "@/lib/ai/raw-openai/limits";
import {
  createOpenAIMediaClient,
  didOpenAIUseImageGeneration,
  extractGeneratedImages,
  persistGeneratedImageFile,
} from "@/lib/ai/raw-openai/media-provider";
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

function newAttachmentId(): string {
  return `att_${crypto.randomUUID().replace(/-/g, "")}`;
}

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
  const imageGenEnabled = isOpenAIImageGenerationEnabled();
  const needsAuth =
    attachmentIds.length > 0 || Boolean(body.threadId) || imageGenEnabled;
  if (needsAuth) {
    const auth = await requireBearerUser(request);
    if ((attachmentIds.length || imageGenEnabled) && !auth.ok) {
      // Image gen persistence needs auth when possible; allow unauthenticated
      // text-only if no attachments and gen will skip DB persist.
      if (attachmentIds.length && !auth.ok) {
        return NextResponse.json(
          { error: auth.error, latencyMs: Date.now() - started },
          { status: auth.status },
        );
      }
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
  const userMessageIds = new Set(
    messages.filter((m) => m.role === "user" && m.id).map((m) => m.id!),
  );

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
            {
              error: "Failed to load attachments.",
              detail: error.message.slice(0, 200),
              latencyMs: Date.now() - started,
            },
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
          .not("openai_file_id", "is", null)
          .order("created_at", { ascending: true });

        const currentSet = new Set(attachmentIds);
        for (const row of prior || []) {
          if (currentSet.has(row.id)) continue;
          if (row.attachment_type === "audio") continue;
          const linkedToUser =
            Boolean(row.message_id) && userMessageIds.has(row.message_id);
          // User-uploaded files stay on their originating user turn.
          // Generated / orphan attachments are available on the latest turn
          // so follow-ups ("make it darker") can reference them.
          if (linkedToUser) {
            attachmentRefs.push({
              id: row.id,
              openaiFileId: row.openai_file_id,
              attachmentType: row.attachment_type as "image" | "document",
              messageId: row.message_id,
            });
          } else {
            attachmentRefs.push({
              id: row.id,
              openaiFileId: row.openai_file_id,
              attachmentType: row.attachment_type as "image" | "document",
              forCurrentTurn: true,
            });
          }
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

  const tools: OpenAI.Responses.Tool[] = [];
  if (webSearchEnabled) tools.push({ type: "web_search" });
  if (imageGenEnabled) tools.push(openAIImageGenerationTool());

  const client = createOpenAIMediaClient(apiKey);
  const createParams: OpenAI.Responses.ResponseCreateParamsNonStreaming = {
    model,
    input: input as OpenAI.Responses.ResponseInput,
    ...(tools.length ? { tools } : {}),
  };

  try {
    const response = await client.responses.create(createParams);

    const content =
      (typeof response.output_text === "string" && response.output_text) ||
      extractText(response) ||
      "";

    const generated = extractGeneratedImages(response.output);
    const images: Array<{
      dataUrl: string;
      mimeType: string;
      name: string;
      attachmentId?: string;
      openaiFileId?: string;
    }> = [];

    if (generated.length && userId) {
      const admin = createSupabaseAdminClient();
      let threadIdForRow: string | null = null;
      if (body.threadId) {
        const { data } = await admin
          .from("threads")
          .select("id")
          .eq("id", body.threadId)
          .maybeSingle();
        threadIdForRow = data?.id ?? null;
      }
      for (let i = 0; i < generated.length; i++) {
        const g = generated[i]!;
        const name = `generated-${i + 1}.png`;
        try {
          const persisted = await persistGeneratedImageFile(
            client,
            g.dataUrl,
            name,
          );
          const id = newAttachmentId();
          const { error } = await admin.from("chat_attachments").insert({
            id,
            user_id: userId,
            thread_id: threadIdForRow,
            message_id: null,
            filename: name,
            mime_type: persisted.mimeType,
            size: persisted.size,
            attachment_type: "image",
            openai_file_id: persisted.openaiFileId,
            status: "pending",
          });
          images.push({
            dataUrl: g.dataUrl,
            mimeType: g.mimeType,
            name,
            ...(error
              ? {}
              : {
                  attachmentId: id,
                  openaiFileId: persisted.openaiFileId,
                }),
          });
        } catch (e) {
          console.log("[RAW_OPENAI_TRACE]", {
            mode: "image_gen_persist",
            success: false,
            error: e instanceof Error ? e.message.slice(0, 200) : "fail",
          });
          images.push({
            dataUrl: g.dataUrl,
            mimeType: g.mimeType,
            name,
          });
        }
      }
    } else {
      for (let i = 0; i < generated.length; i++) {
        const g = generated[i]!;
        images.push({
          dataUrl: g.dataUrl,
          mimeType: g.mimeType,
          name: `generated-${i + 1}.png`,
        });
      }
    }

    const usage = response.usage;
    const latencyMs = Date.now() - started;
    const webSearchUsed = didOpenAIUseWebSearch(response.output);
    const imageGenerationUsed = didOpenAIUseImageGeneration(response.output);

    console.log("[RAW_OPENAI_TRACE]", {
      provider: "openai",
      mode: "raw",
      model,
      webSearchEnabled,
      webSearchUsed,
      imageGenerationEnabled: imageGenEnabled,
      imageGenerationUsed,
      generatedImageCount: images.length,
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
      images: images.length ? images : undefined,
      model,
      webSearchEnabled,
      webSearchUsed,
      imageGenerationEnabled: imageGenEnabled,
      imageGenerationUsed,
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
      imageGenerationEnabled: imageGenEnabled,
      imageGenerationUsed: false,
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
        imageGenerationEnabled: imageGenEnabled,
        imageGenerationUsed: false,
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
