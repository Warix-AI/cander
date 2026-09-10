// 21st.dev component retrieval.
//  proxy  → Cander /api/build-jobs/{jobId}/twenty-first (server holds API_KEY_21ST)
//  direct → https://21st.dev/api/mcp JSON-RPC with API_KEY_21ST (local dev only)

const MCP_URL = "https://21st.dev/api/mcp";

export class TwentyFirstClient {
  /**
   * @param {{ transport: "proxy"|"direct", apiBase?: string|null, jobId: string, token?: string|null, log: import("./events.mjs").EventLog }} opts
   */
  constructor(opts) {
    this.transport = opts.transport;
    this.apiBase = opts.apiBase || null;
    this.jobId = opts.jobId;
    this.token = opts.token || null;
    this.log = opts.log;
    this.sessionId = null;
    this.rpcId = 1;
    this.searchCache = new Map();
    this.getCache = new Map();
  }

  static available(opts) {
    if (opts.transport === "proxy") return Boolean(opts.apiBase && opts.token && opts.twentyFirstEnabled);
    return Boolean(process.env.API_KEY_21ST?.trim() || process.env.TWENTY_FIRST_API_KEY?.trim());
  }

  async search(query, limit) {
    const q = String(query ?? "").trim();
    if (!q) return [];
    const n = Math.min(Math.max(Number(limit) || 5, 1), 5);
    const key = `${q}::${n}`;
    if (this.searchCache.has(key)) return this.searchCache.get(key);
    let hits = [];
    try {
      hits =
        this.transport === "proxy"
          ? await this.proxy({ action: "search", query: q, limit: n })
          : normalizeSearch(await this.rpcTool("search", { query: q, limit: n, type: "component" }));
    } catch (err) {
      this.log.emit("log", `21st search failed: ${err?.message || err}`);
      hits = [];
    }
    hits = Array.isArray(hits) ? hits.slice(0, n) : [];
    this.searchCache.set(key, hits);
    this.log.emit("tool", `21st search "${q}" → ${hits.length} result(s)`, { query: q, n: hits.length });
    return hits;
  }

  async get(id) {
    const key = String(id ?? "").trim();
    if (!key) return null;
    if (this.getCache.has(key)) return this.getCache.get(key);
    let component = null;
    try {
      component =
        this.transport === "proxy"
          ? await this.proxy({ action: "get", id: key })
          : normalizeGet(await this.rpcTool("get_component", { id: key }), key);
    } catch (err) {
      this.log.emit("log", `21st get ${key} failed: ${err?.message || err}`);
      component = null;
    }
    this.getCache.set(key, component);
    if (component) {
      this.log.emit("tool", `21st fetched ${component.name || key}`, { id: key });
    }
    return component;
  }

  async proxy(body) {
    const res = await fetch(
      `${this.apiBase}/api/build-jobs/${encodeURIComponent(this.jobId)}/twenty-first`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      },
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false) {
      throw new Error(json?.error || `21st proxy HTTP ${res.status}`);
    }
    return json.result;
  }

  async rpcTool(name, args) {
    const key = process.env.API_KEY_21ST?.trim() || process.env.TWENTY_FIRST_API_KEY?.trim();
    if (!key) throw new Error("API_KEY_21ST missing");
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "x-api-key": key,
      Authorization: `Bearer ${key}`,
    };
    if (this.sessionId) headers["mcp-session-id"] = this.sessionId;
    const res = await fetch(MCP_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: this.rpcId++,
        method: "tools/call",
        params: { name, arguments: args },
      }),
      signal: AbortSignal.timeout(60_000),
    });
    const sid = res.headers.get("mcp-session-id");
    if (sid) this.sessionId = sid;
    const text = await res.text();
    const payload = parseMcpBody(text);
    if (payload?.error) throw new Error(payload.error.message || "MCP error");
    return unwrap(payload?.result);
  }
}

function parseMcpBody(text) {
  const t = text.trim();
  if (!t) return null;
  if (t.startsWith("{")) {
    try {
      return JSON.parse(t);
    } catch {
      return null;
    }
  }
  // SSE: take the last data: line that parses.
  let last = null;
  for (const line of t.split("\n")) {
    if (line.startsWith("data:")) {
      try {
        last = JSON.parse(line.slice(5).trim());
      } catch {
        /* skip */
      }
    }
  }
  return last;
}

function unwrap(result) {
  if (!result || typeof result !== "object") return result;
  const content = Array.isArray(result.content) ? result.content : null;
  if (content) {
    const text = content
      .filter((c) => c?.type === "text" && typeof c.text === "string")
      .map((c) => c.text)
      .join("\n");
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return result;
}

function normalizeSearch(raw) {
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.results)
      ? raw.results
      : Array.isArray(raw?.components)
        ? raw.components
        : Array.isArray(raw?.items)
          ? raw.items
          : [];
  return list
    .map((r) => ({
      id: String(r?.id ?? r?.component_id ?? r?.slug ?? ""),
      name: String(r?.name ?? r?.title ?? r?.id ?? "Component"),
      category: r?.category ? String(r.category) : undefined,
      description: r?.description ? String(r.description) : undefined,
    }))
    .filter((r) => r.id);
}

function normalizeGet(raw, id) {
  if (!raw) return null;
  if (typeof raw === "string") return { id, name: id, code: raw, dependencies: [] };
  const code =
    raw.code ?? raw.source ?? raw.content ?? raw.files?.[0]?.content ?? raw.component?.code ?? "";
  const deps = raw.dependencies ?? raw.npmDependencies ?? raw.component?.dependencies ?? [];
  return {
    id: String(raw.id ?? id),
    name: String(raw.name ?? raw.title ?? id),
    code: typeof code === "string" ? code : JSON.stringify(code),
    dependencies: Array.isArray(deps) ? deps.map(String) : Object.keys(deps || {}),
  };
}
