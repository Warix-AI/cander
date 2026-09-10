// OpenAI Responses API transport.
//  proxy  → POST {apiBase}/api/build-jobs/{jobId}/llm with the job token
//           (Cander holds OPENAI_API_KEY; nothing secret lives in the sandbox)
//  direct → POST https://api.openai.com/v1/responses with OPENAI_API_KEY
//           (local-dev fallback only)

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

export class LlmClient {
  /**
   * @param {{ transport: "proxy"|"direct", apiBase?: string|null, jobId: string, token?: string|null, log: import("./events.mjs").EventLog }} opts
   */
  constructor(opts) {
    this.transport = opts.transport;
    this.apiBase = opts.apiBase || null;
    this.jobId = opts.jobId;
    this.token = opts.token || null;
    this.log = opts.log;
    this.calls = 0;
    this.inputTokens = 0;
    this.outputTokens = 0;
  }

  endpoint() {
    if (this.transport === "proxy") {
      if (!this.apiBase || !this.token) {
        throw new Error("LLM proxy transport needs apiBase + job token");
      }
      return {
        url: `${this.apiBase}/api/build-jobs/${encodeURIComponent(this.jobId)}/llm`,
        headers: { Authorization: `Bearer ${this.token}` },
      };
    }
    const key = process.env.OPENAI_API_KEY?.trim();
    if (!key) throw new Error("OPENAI_API_KEY missing for direct transport");
    return {
      url: OPENAI_RESPONSES_URL,
      headers: { Authorization: `Bearer ${key}` },
    };
  }

  /**
   * One Responses API call with retries on 429/5xx/network.
   * @param {Record<string, unknown>} body
   * @returns {Promise<any>}
   */
  async responses(body) {
    const { url, headers } = this.endpoint();
    let lastErr = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({ store: true, ...body }),
          signal: AbortSignal.timeout(10 * 60 * 1000),
        });
        const text = await res.text();
        if (res.status === 429 || res.status >= 500) {
          lastErr = new Error(`LLM HTTP ${res.status}: ${text.slice(0, 300)}`);
          await sleep(1500 * 2 ** attempt);
          continue;
        }
        if (!res.ok) {
          throw new Error(`LLM HTTP ${res.status}: ${text.slice(0, 600)}`);
        }
        const json = JSON.parse(text);
        this.calls += 1;
        this.inputTokens += Number(json?.usage?.input_tokens ?? 0);
        this.outputTokens += Number(json?.usage?.output_tokens ?? 0);
        return json;
      } catch (err) {
        lastErr = err;
        if (String(err?.message || "").startsWith("LLM HTTP 4")) throw err;
        await sleep(1500 * 2 ** attempt);
      }
    }
    throw lastErr || new Error("LLM call failed");
  }

  /**
   * Simple text completion (no tools). Used by planner / sub-agents.
   * @param {{ model: string, instructions: string, input: string, reasoning?: string, maxOutputTokens?: number, jsonSchema?: {name: string, schema: Record<string, unknown>} }} opts
   */
  async text(opts) {
    const body = {
      model: opts.model,
      instructions: opts.instructions,
      input: opts.input,
      ...(opts.reasoning ? { reasoning: { effort: opts.reasoning } } : {}),
      ...(opts.maxOutputTokens ? { max_output_tokens: opts.maxOutputTokens } : {}),
      ...(opts.jsonSchema
        ? {
            text: {
              format: {
                type: "json_schema",
                name: opts.jsonSchema.name,
                schema: opts.jsonSchema.schema,
                strict: false,
              },
            },
          }
        : {}),
    };
    const res = await this.responses(body);
    return extractText(res);
  }
}

export function extractText(response) {
  const out = Array.isArray(response?.output) ? response.output : [];
  const parts = [];
  for (const item of out) {
    if (item?.type === "message" && Array.isArray(item.content)) {
      for (const c of item.content) {
        if (c?.type === "output_text" && typeof c.text === "string") {
          parts.push(c.text);
        }
      }
    }
  }
  if (!parts.length && typeof response?.output_text === "string") {
    return response.output_text;
  }
  return parts.join("\n");
}

export function extractFunctionCalls(response) {
  const out = Array.isArray(response?.output) ? response.output : [];
  return out
    .filter((i) => i?.type === "function_call")
    .map((i) => ({
      callId: String(i.call_id),
      name: String(i.name),
      arguments: safeJson(i.arguments),
    }));
}

export function safeJson(raw) {
  if (raw && typeof raw === "object") return raw;
  if (typeof raw !== "string") return {};
  try {
    return JSON.parse(raw);
  } catch {
    // Some models emit trailing commentary; salvage the first JSON object.
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        /* fall through */
      }
    }
    return { _parse_error: true, raw: raw.slice(0, 500) };
  }
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
