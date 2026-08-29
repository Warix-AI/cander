import type { AiProvider, ChatRequest, ChatResult, ChatStreamEvent } from "@/lib/ai/types";
import { ACTIVE_AI_MODEL } from "@/lib/ai/types";
import { isLocalOrPrivateUrl } from "@/lib/ai/authz";

export { isLocalOrPrivateUrl };

function bridgeConfig() {
  const url = (process.env.CANDER_AI_BRIDGE_URL ?? "").replace(/\/$/, "");
  const secret = process.env.CANDER_AI_BRIDGE_SECRET ?? "";
  if (!url) {
    throw new Error("CANDER_AI_BRIDGE_URL is not set (must be HTTPS tunnel URL)");
  }
  if (isLocalOrPrivateUrl(url)) {
    throw new Error(
      "CANDER_AI_BRIDGE_URL must be a public HTTPS tunnel hostname, not localhost or a private IP",
    );
  }
  if (!secret) {
    throw new Error("CANDER_AI_BRIDGE_SECRET is not set");
  }
  return { url, secret };
}

function buildPayload(request: ChatRequest) {
  const messages = [...request.messages];
  if (request.contextText?.trim()) {
    messages.unshift({
      role: "system",
      content: request.contextText.trim(),
    });
  }
  return {
    model: ACTIVE_AI_MODEL,
    messages,
    max_tokens: request.maxTokens,
  };
}

export function createOllamaBridgeProvider(): AiProvider {
  return {
    id: "ollama-bridge",
    capabilities: {
      streaming: true,
      toolCalling: false,
      structuredOutput: false,
      attachments: false,
    },
    async sendChat(request) {
      const { url, secret } = bridgeConfig();
      const res = await fetch(`${url}/v1/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify(buildPayload(request)),
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          res.status === 401
            ? "AI bridge rejected credentials"
            : text || `AI bridge error (${res.status})`,
        );
      }
      const data = (await res.json()) as { content?: string };
      return {
        content: data.content ?? "",
        provider: "ollama-bridge",
        model: ACTIVE_AI_MODEL,
      } satisfies ChatResult;
    },
    async streamChat(request, onEvent) {
      const { url, secret } = bridgeConfig();
      let res: Response;
      try {
        res = await fetch(`${url}/v1/chat/stream`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${secret}`,
          },
          body: JSON.stringify(buildPayload(request)),
          signal: AbortSignal.timeout(180_000),
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "AI bridge unreachable";
        onEvent({ type: "error", message, code: "bridge_offline" });
        throw err;
      }
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        const message =
          res.status === 401
            ? "AI bridge rejected credentials"
            : text || `AI bridge error (${res.status})`;
        onEvent({ type: "error", message, code: String(res.status) });
        throw new Error(message);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let content = "";
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const raw = trimmed.slice(5).trim();
          if (raw === "[DONE]") continue;
          try {
            const event = JSON.parse(raw) as ChatStreamEvent;
            if (event.type === "delta" && event.text) {
              content += event.text;
              onEvent(event);
            } else if (event.type === "done") {
              content = event.content || content;
              onEvent({ type: "done", content });
            } else if (event.type === "error") {
              onEvent(event);
            }
          } catch {
            // ignore malformed chunks
          }
        }
      }
      if (!content) {
        onEvent({ type: "done", content: "" });
      }
      return {
        content,
        provider: "ollama-bridge",
        model: ACTIVE_AI_MODEL,
      };
    },
  };
}
