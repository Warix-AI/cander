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
  detectImageGenerationIntent,
  isOpenAIImageGenerationEnabled,
  openAIImageGenerationTool,
  openAIImageGenerationToolChoice,
  resolveOpenAIImageModel,
  resolveOpenAIImageQuality,
} from "@/lib/ai/raw-openai/image-generation";
import { MAX_ATTACHMENTS_PER_TURN } from "@/lib/ai/raw-openai/limits";
import {
  createOpenAIMediaClient,
  extractGeneratedImages,
  generateImageViaImagesApi,
  persistGeneratedImageFile,
  type GeneratedImageResult,
} from "@/lib/ai/raw-openai/media-provider";
import {
  didOpenAIUseWebSearch,
  isOpenAIWebSearchEnabled,
  resolveOpenAIModel,
} from "@/lib/ai/raw-openai/web-search";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  enforceUsageForRequest,
  finalizeUsageReservation,
} from "@/lib/usage/server/guard-route";
import { parseAssistantRichContent } from "@/lib/usage/response-format/from-assistant-content";

export const runtime = "nodejs";

type Body = {
  messages?: ChatMsg[];
  system?: string;
  images?: string[];
  attachmentIds?: string[];
  threadId?: string | null;
  workspaceId?: string | null;
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
  let usageReservationId: string | null = null;
  const imageGenEnabled = isOpenAIImageGenerationEnabled();

  if (isSupabaseConfigured()) {
    const auth = await requireBearerUser(request);
    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.error, latencyMs: Date.now() - started },
        { status: auth.status },
      );
    }
    userId = auth.user.id;
    const ownership = await assertThreadOwnedByUser(body.threadId, userId);
    if (!ownership.ok) {
      return NextResponse.json(
        { error: ownership.error, latencyMs: Date.now() - started },
        { status: ownership.status },
      );
    }

    const idempotencyKey =
      request.headers.get("Idempotency-Key")?.trim() ||
      `raw-openai:${body.threadId ?? "anon"}:${messages.length}:${attachmentIds.join(",")}`;
    const usage = await enforceUsageForRequest({
      request,
      feature: "ai_chat",
      workspaceId: body.workspaceId,
      threadId: body.threadId,
      idempotencyKey,
      estimatedUnits: 1,
      provider: "openai",
      model: resolveOpenAIModel(),
    });
    if (!usage.ok) {
      return usage.response;
    }
    usageReservationId = usage.reservationId;
  } else {
    const auth = await requireBearerUser(request);
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
    "You are Cander, a concise and capable AI assistant. Answer the user's request directly. Prefer compact, natural responses and avoid unnecessary background, repetition, long introductions, or excessive sectioning. Give enough detail to fully answer the question, but do not expand beyond what is useful. Match the user's requested level of detail when specified.";

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

  const lastUserText = [...messages]
    .reverse()
    .find((m) => m.role === "user")
    ?.content?.trim() || "";
  const imageIntent =
    imageGenEnabled && detectImageGenerationIntent(lastUserText);

  const input = buildRawOpenAIInput({
    system,
    messages,
    attachments: attachmentRefs,
    fallbackImageUrls: fallbackImages,
  });

  const tools: OpenAI.Responses.Tool[] = [];
  if (webSearchEnabled && !imageIntent) tools.push({ type: "web_search" });
  if (imageGenEnabled) tools.push(openAIImageGenerationTool());

  const client = createOpenAIMediaClient(apiKey);
  const createParams: OpenAI.Responses.ResponseCreateParamsNonStreaming = {
    model,
    input: input as OpenAI.Responses.ResponseInput,
    ...(tools.length ? { tools } : {}),
    ...(imageIntent
      ? { tool_choice: openAIImageGenerationToolChoice() }
      : {}),
  };

  console.log("[RAW_OPENAI_TRACE]", {
    mode: "image_intent",
    imageGenerationEnabled: imageGenEnabled,
    imageIntent,
    imageModel: imageGenEnabled ? resolveOpenAIImageModel() : undefined,
    imageQuality: imageGenEnabled ? resolveOpenAIImageQuality() : undefined,
    toolChoice: imageIntent ? "image_generation" : "auto",
    lastUserPreview: lastUserText.slice(0, 120),
  });

  try {
    let response: OpenAI.Responses.Response | null = null;
    let generated: GeneratedImageResult[] = [];
    let content = "";
    let usage: OpenAI.Responses.Response["usage"] | undefined;
    let imagePath: "responses_tool" | "images_api" | "none" = "none";
    let imageError: string | undefined;

    if (imageIntent && imageGenEnabled) {
      // Prefer forced Responses tool; fall back to Images API if the model
      // still returns text without an image_generation_call.
      try {
        response = await client.responses.create(createParams);
        content =
          (typeof response.output_text === "string" && response.output_text) ||
          extractText(response) ||
          "";
        generated = extractGeneratedImages(response.output);
        usage = response.usage;
        if (generated.length) imagePath = "responses_tool";
      } catch (e) {
        imageError = e instanceof Error ? e.message : "responses_image_tool_failed";
        console.log("[RAW_OPENAI_TRACE]", {
          mode: "image_gen_tool_error",
          success: false,
          error: imageError.slice(0, 300),
        });
      }

      if (!generated.length) {
        try {
          console.log("[RAW_OPENAI_TRACE]", {
            mode: "image_gen_fallback",
            reason: imageError || "no_image_generation_call",
            model: resolveOpenAIImageModel(),
            quality: resolveOpenAIImageQuality(),
          });
          const direct = await generateImageViaImagesApi(client, lastUserText, {
            model: resolveOpenAIImageModel(),
            quality: resolveOpenAIImageQuality(),
          });
          generated = [direct];
          imagePath = "images_api";
          content = "";
          imageError = undefined;
        } catch (e) {
          const msg = e instanceof Error ? e.message : "images_api_failed";
          imageError = imageError ? `${imageError}; ${msg}` : msg;
          console.log("[RAW_OPENAI_TRACE]", {
            mode: "image_gen_fallback_error",
            success: false,
            error: msg.slice(0, 300),
          });
          if (!content) {
            return NextResponse.json(
              {
                error: `Image generation failed: ${imageError.slice(0, 400)}`,
                model,
                imageGenerationEnabled: true,
                imageGenerationUsed: false,
                imageIntent: true,
                latencyMs: Date.now() - started,
              },
              { status: 502 },
            );
          }
        }
      }
    } else {
      response = await client.responses.create(createParams);
      content =
        (typeof response.output_text === "string" && response.output_text) ||
        extractText(response) ||
        "";
      generated = extractGeneratedImages(response.output);
      usage = response.usage;
      if (generated.length) imagePath = "responses_tool";
    }

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

    // Never leave the model’s “I can’t generate images” text when we actually
    // produced an image (or when intent failed with a real error above).
    if (images.length) {
      content = content
        .replace(
          /I can[’']t generate images[\s\S]*?(?=\n\n|$)/gi,
          "",
        )
        .trim();
    }

    const latencyMs = Date.now() - started;
    const webSearchUsed = didOpenAIUseWebSearch(response?.output);
    const imageGenerationUsed = images.length > 0;

    console.log("[RAW_OPENAI_TRACE]", {
      provider: "openai",
      mode: "raw",
      model,
      webSearchEnabled,
      webSearchUsed,
      imageGenerationEnabled: imageGenEnabled,
      imageIntent,
      imageGenerationUsed,
      imagePath,
      imageModel: resolveOpenAIImageModel(),
      generatedImageCount: images.length,
      attachmentCount: attachmentRefs.filter((a) => a.forCurrentTurn).length,
      threadMessageCount: messages.length,
      inputTokens: usage?.input_tokens,
      outputTokens: usage?.output_tokens,
      latencyMs,
      success: true,
      threadId: body.threadId ?? undefined,
    });

    await finalizeUsageReservation({
      reservationId: usageReservationId,
      status: "confirmed",
      actualUnits: 1,
    });

    const rich = parseAssistantRichContent(content);

    return NextResponse.json({
      content: rich.content,
      blocks: rich.blocks,
      images: images.length ? images : undefined,
      model,
      webSearchEnabled,
      webSearchUsed,
      imageGenerationEnabled: imageGenEnabled,
      imageGenerationUsed,
      imageIntent,
      imagePath,
      inputTokens: usage?.input_tokens,
      outputTokens: usage?.output_tokens,
      latencyMs,
    });
  } catch (e) {
    await finalizeUsageReservation({
      reservationId: usageReservationId,
      status: "failed",
    });
    const message = e instanceof Error ? e.message : "openai_error";
    const latencyMs = Date.now() - started;
    console.log("[RAW_OPENAI_TRACE]", {
      provider: "openai",
      mode: "raw",
      model,
      webSearchEnabled,
      webSearchUsed: false,
      imageGenerationEnabled: imageGenEnabled,
      imageIntent,
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
        imageIntent,
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
