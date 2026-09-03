/**
 * Raw OpenAI mode — bypass + history + no client key leakage.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  isRawOpenAIModeAllowedOnServer,
  isRawOpenAIModeEnabled,
} from "../lib/ai/raw-openai/flags.ts";
import { resolveAssistantRuntimePath } from "../lib/ai/raw-openai/path.ts";
import {
  buildRawOpenAIHistory,
  runRawOpenAITurn,
} from "../lib/ai/raw-openai/run-turn.ts";
import { extractOpenAICitations } from "../lib/ai/raw-openai/citations.ts";
import {
  encodeRawOpenAIStreamEvent,
  parseRawOpenAIStreamLine,
  textDeltaFromOpenAIStreamEvent,
} from "../lib/ai/raw-openai/stream-events.ts";
import {
  didOpenAIUseWebSearch,
  isOpenAIWebSearchEnabled,
  resolveOpenAIModel,
} from "../lib/ai/raw-openai/web-search.ts";

describe("OpenAI chat flags", () => {
  it("defaults on unless explicitly disabled", () => {
    const prevN = process.env.NEXT_PUBLIC_RAW_OPENAI_MODE;
    const prevR = process.env.RAW_OPENAI_MODE;
    const prevNode = process.env.NODE_ENV;
    const prevVercel = process.env.VERCEL_ENV;
    delete process.env.NEXT_PUBLIC_RAW_OPENAI_MODE;
    delete process.env.RAW_OPENAI_MODE;
    process.env.NODE_ENV = "development";
    delete process.env.VERCEL_ENV;
    assert.equal(isRawOpenAIModeEnabled(), true);
    assert.equal(isRawOpenAIModeAllowedOnServer(), true);
    process.env.NEXT_PUBLIC_RAW_OPENAI_MODE = "0";
    assert.equal(isRawOpenAIModeEnabled(), false);
    assert.equal(isRawOpenAIModeAllowedOnServer(), false);
    if (prevN !== undefined) process.env.NEXT_PUBLIC_RAW_OPENAI_MODE = prevN;
    else delete process.env.NEXT_PUBLIC_RAW_OPENAI_MODE;
    if (prevR !== undefined) process.env.RAW_OPENAI_MODE = prevR;
    else delete process.env.RAW_OPENAI_MODE;
    if (prevNode !== undefined) process.env.NODE_ENV = prevNode;
    else delete process.env.NODE_ENV;
    if (prevVercel !== undefined) process.env.VERCEL_ENV = prevVercel;
    else delete process.env.VERCEL_ENV;
  });

  it("stays on in production by default", () => {
    const prevN = process.env.NEXT_PUBLIC_RAW_OPENAI_MODE;
    const prevR = process.env.RAW_OPENAI_MODE;
    const prevNode = process.env.NODE_ENV;
    const prevVercel = process.env.VERCEL_ENV;
    delete process.env.NEXT_PUBLIC_RAW_OPENAI_MODE;
    delete process.env.RAW_OPENAI_MODE;
    process.env.NODE_ENV = "production";
    process.env.VERCEL_ENV = "production";
    assert.equal(isRawOpenAIModeEnabled(), true);
    assert.equal(isRawOpenAIModeAllowedOnServer(), true);
    process.env.RAW_OPENAI_MODE = "0";
    assert.equal(isRawOpenAIModeAllowedOnServer(), false);
    if (prevN !== undefined) process.env.NEXT_PUBLIC_RAW_OPENAI_MODE = prevN;
    if (prevR !== undefined) process.env.RAW_OPENAI_MODE = prevR;
    if (prevNode !== undefined) process.env.NODE_ENV = prevNode;
    else delete process.env.NODE_ENV;
    if (prevVercel !== undefined) process.env.VERCEL_ENV = prevVercel;
    else delete process.env.VERCEL_ENV;
  });

  it("can opt out via NEXT_PUBLIC_RAW_OPENAI_MODE=0", () => {
    const prev = process.env.NEXT_PUBLIC_RAW_OPENAI_MODE;
    const prevRaw = process.env.RAW_OPENAI_MODE;
    delete process.env.RAW_OPENAI_MODE;
    process.env.NEXT_PUBLIC_RAW_OPENAI_MODE = "0";
    assert.equal(isRawOpenAIModeEnabled(), false);
    assert.equal(isRawOpenAIModeAllowedOnServer(), false);
    if (prev === undefined) delete process.env.NEXT_PUBLIC_RAW_OPENAI_MODE;
    else process.env.NEXT_PUBLIC_RAW_OPENAI_MODE = prev;
    if (prevRaw === undefined) delete process.env.RAW_OPENAI_MODE;
    else process.env.RAW_OPENAI_MODE = prevRaw;
  });
});

describe("OpenAI web search flag", () => {
  it("defaults off when unset", () => {
    const prev = process.env.OPENAI_WEB_SEARCH;
    delete process.env.OPENAI_WEB_SEARCH;
    assert.equal(isOpenAIWebSearchEnabled(), false);
    if (prev !== undefined) process.env.OPENAI_WEB_SEARCH = prev;
  });

  it("enables with OPENAI_WEB_SEARCH=1", () => {
    const prev = process.env.OPENAI_WEB_SEARCH;
    process.env.OPENAI_WEB_SEARCH = "1";
    assert.equal(isOpenAIWebSearchEnabled(), true);
    if (prev === undefined) delete process.env.OPENAI_WEB_SEARCH;
    else process.env.OPENAI_WEB_SEARCH = prev;
  });

  it("detects web_search_call in output", () => {
    assert.equal(didOpenAIUseWebSearch([{ type: "message" }]), false);
    assert.equal(
      didOpenAIUseWebSearch([
        { type: "web_search_call" },
        { type: "message" },
      ]),
      true,
    );
  });

  it("resolves model from OPENAI_MODEL", () => {
    const prev = process.env.OPENAI_MODEL;
    process.env.OPENAI_MODEL = "gpt-5.6-luna";
    assert.equal(resolveOpenAIModel(), "gpt-5.6-luna");
    if (prev === undefined) delete process.env.OPENAI_MODEL;
    else process.env.OPENAI_MODEL = prev;
  });
});

describe("Raw OpenAI stream events", () => {
  it("round-trips NDJSON lines", () => {
    const line = encodeRawOpenAIStreamEvent({ type: "delta", text: "Hi" });
    const parsed = parseRawOpenAIStreamLine(line);
    assert.equal(parsed?.type, "delta");
    if (parsed?.type === "delta") assert.equal(parsed.text, "Hi");
  });

  it("reads OpenAI output_text.delta events", () => {
    assert.equal(
      textDeltaFromOpenAIStreamEvent({
        type: "response.output_text.delta",
        delta: "token",
      }),
      "token",
    );
    assert.equal(
      textDeltaFromOpenAIStreamEvent({ type: "response.completed" }),
      "",
    );
  });

  it("extracts http url_citation annotations only", () => {
    const cites = extractOpenAICitations([
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: "BYU plays Saturday.",
            annotations: [
              {
                type: "url_citation",
                title: "BYU Athletics",
                url: "https://byucougars.com/schedule",
              },
              {
                type: "url_citation",
                title: "bad",
                url: "javascript:alert(1)",
              },
            ],
          },
        ],
      },
    ]);
    assert.equal(cites.length, 1);
    assert.equal(cites[0]?.url, "https://byucougars.com/schedule");
    assert.equal(cites[0]?.title, "BYU Athletics");
  });
});

describe("Chat runtime path", () => {
  it("always uses OpenAI", () => {
    assert.equal(resolveAssistantRuntimePath(), "openai");
  });
});

describe("Raw OpenAI history", () => {
  it("sends full thread history including current turn", () => {
    const history = buildRawOpenAIHistory({
      content: "what about that?",
      title: "t",
      workspaceId: "ws",
      messages: [
        { role: "user", content: "Tell me about Polar" },
        { role: "assistant", content: "Polar is a billing company." },
        { role: "user", content: "who is the CEO?" },
        { role: "assistant", content: "I am not sure." },
      ],
    });
    assert.equal(history.length, 5);
    assert.equal(history[0]?.content, "Tell me about Polar");
    assert.equal(history[4]?.content, "what about that?");
  });
});

describe("Raw OpenAI client turn", () => {
  it("POSTs history to /api/ai/raw-openai and returns content directly", async () => {
    const bodies: unknown[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      assert.equal(String(_url), "/api/ai/raw-openai");
      bodies.push(JSON.parse(String(init?.body || "{}")));
      return new Response(
        JSON.stringify({
          content: "raw openai answer",
          model: "gpt-5.6-luna",
          webSearchEnabled: true,
          webSearchUsed: false,
          inputTokens: 12,
          outputTokens: 4,
          latencyMs: 10,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    try {
      const result = await runRawOpenAITurn({
        content: "what about that?",
        title: "t",
        workspaceId: "ws",
        threadId: "th1",
        messages: [
          { role: "user", content: "Tell me about Polar" },
          { role: "assistant", content: "Polar is a billing company." },
        ],
      });
      assert.equal(result.content, "raw openai answer");
      assert.equal(result.runtime, "cloud");
      const body = bodies[0] as {
        messages: Array<{ role: string; content: string }>;
      };
      assert.ok(body.messages.length >= 3);
      assert.equal(
        JSON.stringify(body).toLowerCase().includes("api_key"),
        false,
      );
      assert.equal(JSON.stringify(body).includes("sk-"), false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("paints NDJSON deltas as they arrive", async () => {
    const originalFetch = globalThis.fetch;
    const deltas: string[] = [];
    globalThis.fetch = (async () => {
      const body = [
        JSON.stringify({ type: "delta", text: "Hel" }),
        JSON.stringify({ type: "delta", text: "lo" }),
        JSON.stringify({
          type: "done",
          content: "Hello",
          model: "gpt-5.6-luna",
          latencyMs: 8,
          citations: [
            {
              id: "s1",
              title: "BYU Athletics",
              url: "https://byucougars.com/schedule",
            },
          ],
        }),
        "",
      ].join("\n");
      return new Response(body, {
        status: 200,
        headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
      });
    }) as typeof fetch;

    try {
      const result = await runRawOpenAITurn(
        {
          content: "hi there friend",
          title: "t",
          workspaceId: "ws",
          messages: [{ role: "user", content: "hi there friend" }],
        },
        {
          onProgress: (p) => {
            if (p.contentDelta) deltas.push(p.contentDelta);
          },
        },
      );
      assert.equal(result.content, "Hello");
      assert.equal(result.presentationStreamed, true);
      assert.equal(result.citations?.[0]?.url, "https://byucougars.com/schedule");
      assert.deepEqual(deltas, ["Hel", "Hello"]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("No client OpenAI secret / no Exa on raw path", () => {
  it("client modules never reference OPENAI_API_KEY", () => {
    for (const rel of [
      "lib/ai/raw-openai/run-turn.ts",
      "lib/ai/raw-openai/flags.ts",
      "lib/ai/raw-openai/path.ts",
      "lib/ai/raw-openai/web-search.ts",
      "lib/ai/raw-openai/citations.ts",
      "lib/open-in-app-browser.ts",
      "lib/native/save-image.ts",
      "components/chat/AssistantMessage.tsx",
    ]) {
      const src = fs.readFileSync(rel, "utf8");
      assert.equal(src.includes("OPENAI_API_KEY"), false, rel);
      assert.equal(src.includes("NEXT_PUBLIC_OPENAI"), false, rel);
      assert.equal(/\bexa\b/i.test(src), false, rel);
    }
  });

  it("server route reads OPENAI_API_KEY only server-side and uses native web_search", () => {
    const src = fs.readFileSync("app/api/ai/raw-openai/route.ts", "utf8");
    assert.ok(src.includes("process.env.OPENAI_API_KEY"));
    assert.equal(src.includes("NEXT_PUBLIC_OPENAI_API_KEY"), false);
    assert.ok(src.includes('type: "web_search"'));
    assert.ok(src.includes("isOpenAIWebSearchEnabled"));
    assert.ok(src.includes("stream: true"));
    assert.ok(src.includes("extractOpenAICitations"));
    assert.equal(/\bexa\b/i.test(src), false);
    assert.equal(/\btool_choice\b/.test(src) && !/image_generation/.test(src), false);
  });
});
