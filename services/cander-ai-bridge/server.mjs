/**
 * Cander AI Bridge — localhost-only reverse proxy to Ollama.
 * Expose via Cloudflare Tunnel HTTPS; never put Ollama on the tunnel.
 *
 * Env:
 *   CANDER_AI_BRIDGE_SECRET (required)
 *   OLLAMA_HOST (default http://127.0.0.1:11434)
 *   BRIDGE_HOST (default 127.0.0.1)
 *   BRIDGE_PORT (default 8787)
 *   BRIDGE_RATE_LIMIT_PER_MIN (default 30)
 *   BRIDGE_MAX_BODY_BYTES (default 1048576)
 */

import http from "node:http";
import { timingSafeEqual } from "node:crypto";

const SECRET = process.env.CANDER_AI_BRIDGE_SECRET ?? "";
const OLLAMA_HOST = (process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434").replace(
  /\/$/,
  "",
);
const HOST = process.env.BRIDGE_HOST ?? "127.0.0.1";
const PORT = Number(process.env.BRIDGE_PORT ?? "8787");
const RATE_LIMIT = Number(process.env.BRIDGE_RATE_LIMIT_PER_MIN ?? "30");
const MAX_BODY = Number(process.env.BRIDGE_MAX_BODY_BYTES ?? String(1024 * 1024));
const MODEL = "llama3.2";

/** @type {Map<string, { count: number; resetAt: number }>} */
const buckets = new Map();

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function unauthorized(res) {
  json(res, 401, { error: "unauthorized" });
}

function rateLimited(res) {
  json(res, 429, { error: "rate_limited" });
}

function checkSecret(req) {
  if (!SECRET) return false;
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ")
    ? header.slice(7)
    : req.headers["x-cander-bridge-secret"] ?? "";
  if (typeof token !== "string" || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(SECRET);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function clientKey(req) {
  return (
    req.headers["cf-connecting-ip"] ||
    req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown"
  );
}

function takeToken(key) {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + 60_000 };
    buckets.set(key, bucket);
  }
  if (bucket.count >= RATE_LIMIT) return false;
  bucket.count += 1;
  return true;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error("body_too_large"), { code: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function callOllama(messages, stream) {
  const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages,
      stream,
    }),
    signal: AbortSignal.timeout(180_000),
  });
  return res;
}

function normalizeMessages(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m) => m && typeof m.content === "string")
    .map((m) => ({
      role: m.role === "assistant" || m.role === "system" ? m.role : "user",
      content: String(m.content),
    }));
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") {
      json(res, 200, { ok: true, model: MODEL });
      return;
    }

    if (!checkSecret(req)) {
      unauthorized(res);
      return;
    }

    if (!takeToken(clientKey(req))) {
      rateLimited(res);
      return;
    }

    if (req.method !== "POST") {
      json(res, 405, { error: "method_not_allowed" });
      return;
    }

    const path = req.url?.split("?")[0] ?? "";
    let bodyText;
    try {
      bodyText = await readBody(req);
    } catch (err) {
      if (err?.code === 413) {
        json(res, 413, { error: "body_too_large" });
        return;
      }
      throw err;
    }

    let payload;
    try {
      payload = JSON.parse(bodyText || "{}");
    } catch {
      json(res, 400, { error: "invalid_json" });
      return;
    }

    const messages = normalizeMessages(payload.messages);
    if (!messages.length) {
      json(res, 400, { error: "messages_required" });
      return;
    }

    if (path === "/v1/chat") {
      const ollamaRes = await callOllama(messages, false);
      if (!ollamaRes.ok) {
        const text = await ollamaRes.text();
        json(res, 502, { error: "ollama_error", detail: text.slice(0, 500) });
        return;
      }
      const data = await ollamaRes.json();
      const content = data?.message?.content ?? "";
      json(res, 200, { content, model: MODEL });
      return;
    }

    if (path === "/v1/chat/stream") {
      const ollamaRes = await callOllama(messages, true);
      if (!ollamaRes.ok || !ollamaRes.body) {
        const text = await ollamaRes.text().catch(() => "");
        json(res, 502, { error: "ollama_error", detail: text.slice(0, 500) });
        return;
      }

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      const reader = ollamaRes.body.getReader();
      const decoder = new TextDecoder();
      let full = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const chunk = JSON.parse(trimmed);
            const delta = chunk?.message?.content ?? "";
            if (delta) {
              full += delta;
              res.write(`data: ${JSON.stringify({ type: "delta", text: delta })}\n\n`);
            }
            if (chunk?.done) {
              res.write(
                `data: ${JSON.stringify({ type: "done", content: full })}\n\n`,
              );
            }
          } catch {
            // skip
          }
        }
      }
      res.write(`data: ${JSON.stringify({ type: "done", content: full })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

    json(res, 404, { error: "not_found" });
  } catch (err) {
    console.error("[cander-ai-bridge]", err);
    if (!res.headersSent) {
      json(res, 500, {
        error: "bridge_error",
        message: err instanceof Error ? err.message : "unknown",
      });
    } else {
      res.end();
    }
  }
});

if (!SECRET) {
  console.error("CANDER_AI_BRIDGE_SECRET is required");
  process.exit(1);
}

server.listen(PORT, HOST, () => {
  console.log(
    `[cander-ai-bridge] listening on http://${HOST}:${PORT} → ${OLLAMA_HOST} model=${MODEL}`,
  );
  console.log(
    "[cander-ai-bridge] expose only via Cloudflare Tunnel HTTPS; set Edge CANDER_AI_BRIDGE_URL to that hostname",
  );
});
