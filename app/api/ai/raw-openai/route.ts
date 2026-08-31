/**
 * Server-only Raw OpenAI Responses API.
 * OPENAI_API_KEY must never appear in client bundles.
 * Optional native web_search via OPENAI_WEB_SEARCH=1 (no Cander web router).
 */

import { NextResponse } from "next/server";
import OpenAI from "openai";
import { isRawOpenAIModeAllowedOnServer } from "@/lib/ai/raw-openai/flags";
import {
  didOpenAIUseWebSearch,
  isOpenAIWebSearchEnabled,
  resolveOpenAIModel,
} from "@/lib/ai/raw-openai/web-search";

export const runtime = "nodejs";

type ChatMsg = {
  role: "user" | "assistant" | "system";
  content: string;
};

type Body = {
  messages?: ChatMsg[];
  system?: string;
  images?: string[];
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

  const model = resolveOpenAIModel();
  const webSearchEnabled = isOpenAIWebSearchEnabled();
  const system =
    (body.system || "").trim() ||
    "You are a helpful assistant. Answer clearly using the conversation history.";

  // Build Responses API input: system + full thread (no Cander compression)
  type EasyInput = OpenAI.Responses.ResponseInputItem;
  const input: EasyInput[] = [
    {
      role: "system",
      content: system,
    },
  ];

  for (const m of messages) {
    const role =
      m.role === "assistant" ? "assistant" : m.role === "system" ? "system" : "user";
    const text = (m.content || "").slice(0, 100_000);
    if (!text.trim() && role !== "user") continue;
    input.push({
      role,
      content: text,
    });
  }

  // Attach images to the last user turn when provided
  const images = (body.images || []).filter((u) => typeof u === "string" && u.length > 0);
  if (images.length) {
    const lastUserIdx = [...input]
      .map((item, i) => ({ item, i }))
      .reverse()
      .find((x) => "role" in x.item && x.item.role === "user")?.i;
    if (lastUserIdx != null) {
      const prev = input[lastUserIdx] as {
        role: "user";
        content: string | OpenAI.Responses.ResponseInputContent[];
      };
      const textPart = typeof prev.content === "string" ? prev.content : "";
      const content: OpenAI.Responses.ResponseInputContent[] = [
        { type: "input_text", text: textPart || "(see attached image)" },
        ...images.slice(0, 4).map((url) => ({
          type: "input_image" as const,
          image_url: url,
          detail: "auto" as const,
        })),
      ];
      input[lastUserIdx] = { role: "user", content };
    }
  }

  const client = new OpenAI({ apiKey });

  // Model decides when to search (ChatGPT-like); do not force the tool.
  const createParams: OpenAI.Responses.ResponseCreateParamsNonStreaming = {
    model,
    input,
    ...(webSearchEnabled
      ? { tools: [{ type: "web_search" as const }] }
      : {}),
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
