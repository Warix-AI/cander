/**
 * Server-only 21st.dev MCP client (HTTP JSON-RPC).
 * Endpoint: https://21st.dev/api/mcp
 * Auth: x-api-key from API_KEY_21ST / TWENTY_FIRST_API_KEY (never NEXT_PUBLIC_).
 *
 * Protocol: initialize → notifications/initialized → tools/list → tools/call
 * Bounded + cached per build session so we do not re-hit 21st for the same queries.
 */

import type { RetrievedComponentRef } from "@/lib/ai/build/website-setup-brief";
import type { SiteSpec } from "@/lib/ai/build/site-spec";

export const TWENTY_FIRST_MCP_URL = "https://21st.dev/api/mcp";

const LOG = "[cander:21st-mcp]";

export function getTwentyFirstApiKey(): string | null {
  // Never read NEXT_PUBLIC_* — key must stay server-only.
  const key =
    process.env.API_KEY_21ST?.trim() ||
    process.env.TWENTY_FIRST_API_KEY?.trim() ||
    "";
  return key || null;
}

export function isTwentyFirstConfigured(): boolean {
  return Boolean(getTwentyFirstApiKey());
}

export type McpToolDescriptor = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};

type JsonRpcResponse = {
  jsonrpc?: string;
  id?: number | string | null;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
};

function logInfo(msg: string, extra?: Record<string, unknown>) {
  if (extra) console.info(LOG, msg, extra);
  else console.info(LOG, msg);
}

function logWarn(msg: string, extra?: Record<string, unknown>) {
  if (extra) console.warn(LOG, msg, extra);
  else console.warn(LOG, msg);
}

async function parseMcpHttpBody(res: Response): Promise<JsonRpcResponse> {
  const contentType = res.headers.get("content-type") || "";
  const raw = await res.text();
  if (!raw.trim()) {
    return {};
  }

  // Streamable HTTP / SSE: lines like `data: {...}`
  if (
    contentType.includes("text/event-stream") ||
    raw.includes("data:")
  ) {
    const dataLines = raw
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter(Boolean);
    for (let i = dataLines.length - 1; i >= 0; i--) {
      try {
        const parsed = JSON.parse(dataLines[i]!) as JsonRpcResponse;
        if (parsed.result !== undefined || parsed.error !== undefined) {
          return parsed;
        }
      } catch {
        /* continue */
      }
    }
  }

  try {
    return JSON.parse(raw) as JsonRpcResponse;
  } catch {
    throw new Error(`21st MCP non-JSON response (${res.status}): ${raw.slice(0, 240)}`);
  }
}

function unwrapToolResult(result: unknown): unknown {
  if (!result || typeof result !== "object") return result;
  const r = result as {
    content?: Array<{ type?: string; text?: string }>;
    structuredContent?: unknown;
    isError?: boolean;
  };
  if (r.isError) {
    const text = r.content?.map((c) => c.text).filter(Boolean).join("\n");
    throw new Error(text || "21st MCP tool returned isError");
  }
  if (r.structuredContent !== undefined) return r.structuredContent;
  const textParts = (r.content ?? [])
    .filter((c) => c.type === "text" && c.text)
    .map((c) => c.text!);
  if (textParts.length === 1) {
    const t = textParts[0]!;
    try {
      return JSON.parse(t);
    } catch {
      return t;
    }
  }
  if (textParts.length > 1) {
    return textParts.join("\n");
  }
  return result;
}

/**
 * One MCP connection + per-build caches for search/get.
 */
export class TwentyFirstMcpClient {
  private apiKey: string;
  private sessionId: string | null = null;
  private rpcId = 1;
  private connected = false;
  private tools: McpToolDescriptor[] = [];
  private searchCache = new Map<string, RetrievedComponentRef[]>();
  private getCache = new Map<string, RetrievedComponentRef | null>();
  private toolNameMap = {
    search: "search",
    get_component: "get_component",
  };

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  get discoveredTools(): string[] {
    return this.tools.map((t) => t.name);
  }

  get isConnected(): boolean {
    return this.connected;
  }

  private nextId() {
    return this.rpcId++;
  }

  private async rpc(
    method: string,
    params?: Record<string, unknown>,
    opts?: { notification?: boolean },
  ): Promise<unknown> {
    const id = opts?.notification ? undefined : this.nextId();
    const body: Record<string, unknown> = {
      jsonrpc: "2.0",
      method,
    };
    if (id !== undefined) body.id = id;
    if (params !== undefined) body.params = params;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "x-api-key": this.apiKey,
    };
    if (this.sessionId) {
      headers["mcp-session-id"] = this.sessionId;
    }

    const res = await fetch(TWENTY_FIRST_MCP_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    const sid = res.headers.get("mcp-session-id");
    if (sid) this.sessionId = sid;

    if (opts?.notification) {
      if (!res.ok && res.status !== 202 && res.status !== 204) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `21st MCP notification ${method} failed (${res.status}): ${text.slice(0, 200)}`,
        );
      }
      return null;
    }

    const payload = await parseMcpHttpBody(res);
    if (!res.ok && !payload.error) {
      throw new Error(
        `21st MCP ${method} HTTP ${res.status}`,
      );
    }
    if (payload.error?.message) {
      throw new Error(`21st MCP ${method}: ${payload.error.message}`);
    }
    return payload.result;
  }

  /** initialize + tools/list. Safe to call once per build. */
  async connect(): Promise<{ ok: boolean; tools: string[]; error?: string }> {
    if (this.connected && this.tools.length) {
      return { ok: true, tools: this.discoveredTools };
    }
    try {
      logInfo("connecting", { url: TWENTY_FIRST_MCP_URL });
      await this.rpc("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "cander-build", version: "1.0.0" },
      });
      try {
        await this.rpc("notifications/initialized", {}, { notification: true });
      } catch (err) {
        logWarn("notifications/initialized skipped", {
          error: err instanceof Error ? err.message : String(err),
        });
      }

      const listed = await this.rpc("tools/list", {});
      const toolsRaw =
        listed &&
        typeof listed === "object" &&
        Array.isArray((listed as { tools?: unknown }).tools)
          ? ((listed as { tools: McpToolDescriptor[] }).tools)
          : [];
      this.tools = toolsRaw.map((t) => ({
        name: String(t.name),
        description:
          typeof t.description === "string" ? t.description : undefined,
        inputSchema:
          t.inputSchema && typeof t.inputSchema === "object"
            ? (t.inputSchema as Record<string, unknown>)
            : undefined,
      }));

      const names = new Set(this.discoveredTools);
      // Prefer current names; fall back to legacy Magic names if needed.
      if (!names.has("search")) {
        for (const legacy of [
          "21st_magic_component_inspiration",
          "get_inspiration",
        ]) {
          if (names.has(legacy)) {
            this.toolNameMap.search = legacy;
            break;
          }
        }
      }
      if (!names.has("get_component")) {
        for (const legacy of [
          "21st_magic_component_builder",
          "generate",
        ]) {
          if (names.has(legacy) && legacy !== this.toolNameMap.search) {
            // Prefer explicit get if present; otherwise keep get_component name
            // and let call fail loudly.
            break;
          }
        }
      }

      this.connected = true;
      logInfo("connected", {
        session: this.sessionId ? "yes" : "none",
        tools: this.discoveredTools,
        searchTool: this.toolNameMap.search,
        getTool: this.toolNameMap.get_component,
      });
      return { ok: true, tools: this.discoveredTools };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logWarn("connect failed", { error: message });
      this.connected = false;
      return { ok: false, tools: [], error: message };
    }
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    if (!this.connected) {
      const c = await this.connect();
      if (!c.ok) throw new Error(c.error || "21st MCP not connected");
    }
    logInfo("tools/call", { tool: name, keys: Object.keys(args) });
    const result = await this.rpc("tools/call", {
      name,
      arguments: args,
    });
    return unwrapToolResult(result);
  }

  async search(opts: {
    query: string;
    limit?: number;
    role?: string;
  }): Promise<RetrievedComponentRef[]> {
    const limit = Math.min(opts.limit ?? 5, 5);
    const cacheKey = `${opts.role ?? ""}::${opts.query}::${limit}`;
    const cached = this.searchCache.get(cacheKey);
    if (cached) {
      logInfo("search cache hit", { query: opts.query, role: opts.role, n: cached.length });
      return cached;
    }

    const raw = await this.callTool(this.toolNameMap.search, {
      query: opts.query,
      ...(opts.role ? { role: opts.role } : {}),
      limit,
      // Common 21st search filters
      type: "component",
    });
    const hits = normalizeSearchResults(raw, opts.query).slice(0, limit);
    this.searchCache.set(cacheKey, hits);
    logInfo("search results", {
      query: opts.query,
      role: opts.role,
      count: hits.length,
      ids: hits.map((h) => h.id),
    });
    return hits;
  }

  async getComponent(id: string): Promise<RetrievedComponentRef | null> {
    const key = id.trim();
    if (!key) return null;
    if (this.getCache.has(key)) {
      logInfo("get_component cache hit", { id: key });
      return this.getCache.get(key) ?? null;
    }
    const raw = await this.callTool(this.toolNameMap.get_component, {
      id: key,
      // Some servers accept searchId / componentId
      searchId: key,
      componentId: key,
    });
    const component = normalizeComponent(raw, key);
    this.getCache.set(key, component);
    logInfo("get_component", {
      id: key,
      name: component?.name,
      hasCode: Boolean(component?.codeSnippet?.trim()),
      codeChars: component?.codeSnippet?.length ?? 0,
    });
    return component;
  }
}

function normalizeSearchResults(
  raw: unknown,
  fallbackQuery: string,
): RetrievedComponentRef[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object"
      ? Array.isArray((raw as { results?: unknown }).results)
        ? (raw as { results: unknown[] }).results
        : Array.isArray((raw as { components?: unknown }).components)
          ? (raw as { components: unknown[] }).components
          : Array.isArray((raw as { items?: unknown }).items)
            ? (raw as { items: unknown[] }).items
            : []
      : [];

  return list.slice(0, 8).map((item, i) => {
    const o = (item && typeof item === "object" ? item : {}) as Record<
      string,
      unknown
    >;
    const id = String(
      o.id ?? o.searchId ?? o.componentId ?? o.slug ?? `21st-${fallbackQuery}-${i}`,
    );
    return {
      id,
      name: String(o.name ?? o.title ?? `Component ${i + 1}`),
      category: String(o.category ?? o.role ?? o.type ?? "section"),
      source: "twenty_first",
      codeSnippet: pickCode(o),
      dependencies: Array.isArray(o.dependencies)
        ? o.dependencies.map(String)
        : undefined,
    };
  });
}

function pickCode(o: Record<string, unknown>): string | undefined {
  for (const key of [
    "code",
    "source",
    "tsx",
    "jsx",
    "componentCode",
    "files",
  ]) {
    const v = o[key];
    if (typeof v === "string" && v.trim()) return v;
  }
  if (o.demo && typeof o.demo === "object") {
    const demo = o.demo as Record<string, unknown>;
    if (typeof demo.code === "string") return demo.code;
  }
  return undefined;
}

function normalizeComponent(
  raw: unknown,
  id: string,
): RetrievedComponentRef | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    return {
      id,
      name: id,
      category: "section",
      source: "twenty_first",
      codeSnippet: raw,
    };
  }
  if (typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  // Nested shapes: { component: {...} } / { data: {...} }
  const inner =
    o.component && typeof o.component === "object"
      ? (o.component as Record<string, unknown>)
      : o.data && typeof o.data === "object"
        ? (o.data as Record<string, unknown>)
        : o;
  return {
    id: String(inner.id ?? o.id ?? id),
    name: String(inner.name ?? inner.title ?? o.name ?? id),
    category: String(inner.category ?? o.category ?? "section"),
    source: "twenty_first",
    codeSnippet: pickCode(inner) ?? pickCode(o),
    dependencies: Array.isArray(inner.dependencies)
      ? inner.dependencies.map(String)
      : Array.isArray(o.dependencies)
        ? o.dependencies.map(String)
        : undefined,
  };
}

const ROLE_QUERIES: Array<{ role: string; query: string }> = [
  { role: "header", query: "website header navigation bar react" },
  { role: "hero", query: "marketing landing page hero section react" },
  { role: "services", query: "services features grid section react" },
  { role: "gallery", query: "image gallery section react" },
  { role: "testimonials", query: "testimonials reviews section react" },
  { role: "stats", query: "stats metrics numbers strip react" },
  { role: "faq", query: "faq accordion section react" },
  { role: "form", query: "contact form section react" },
  { role: "cta", query: "call to action banner section react" },
  { role: "footer", query: "website footer multi column react" },
];

export type SiteSpecRetrievalResult = {
  components: RetrievedComponentRef[];
  usedFallback: boolean;
  connected: boolean;
  toolsDiscovered: string[];
  error?: string;
};

function rolesNeededFromSpec(spec: SiteSpec): Set<string> {
  const needed = new Set<string>(["header", "hero", "footer"]);
  for (const page of spec.pages) {
    for (const section of page.sections) {
      if (section.kind === "services" || section.kind === "features") {
        needed.add("services");
      } else if (section.kind === "gallery") needed.add("gallery");
      else if (section.kind === "testimonials") needed.add("testimonials");
      else if (section.kind === "stats") needed.add("stats");
      else if (section.kind === "faq") needed.add("faq");
      else if (section.kind === "form") needed.add("form");
      else if (section.kind === "cta") needed.add("cta");
    }
  }
  // Cap roles so one build stays bounded (search+get per role).
  return needed;
}

/** Module-level client for the active build turn (set by project-turn). */
let activeBuildClient: TwentyFirstMcpClient | null = null;

export function setActiveTwentyFirstClient(
  client: TwentyFirstMcpClient | null,
) {
  activeBuildClient = client;
}

export function getActiveTwentyFirstClient(): TwentyFirstMcpClient | null {
  return activeBuildClient;
}

export async function createTwentyFirstMcpClient(): Promise<TwentyFirstMcpClient | null> {
  const key = getTwentyFirstApiKey();
  if (!key) {
    logWarn("API_KEY_21ST not set — 21st MCP disabled (catalog fallback)");
    return null;
  }
  const client = new TwentyFirstMcpClient(key);
  const conn = await client.connect();
  if (!conn.ok) return null;
  return client;
}

/**
 * Retrieve 21st.dev components matching a SiteSpec (bounded + cached).
 * On failure / empty → caller should use Cander catalog compose fallback.
 */
export async function retrieveComponentsForSiteSpec(
  spec: SiteSpec,
  client?: TwentyFirstMcpClient | null,
): Promise<SiteSpecRetrievalResult> {
  const mcp =
    client === undefined ? await createTwentyFirstMcpClient() : client;

  if (!mcp) {
    logWarn("retrieval skipped — MCP unavailable; using catalog fallback");
    return {
      components: [],
      usedFallback: true,
      connected: false,
      toolsDiscovered: [],
      error: "21st MCP not configured or connect failed",
    };
  }

  setActiveTwentyFirstClient(mcp);
  const needed = rolesNeededFromSpec(spec);
  const styleHint = `${spec.theme.layoutStyle} ${spec.industry} ${spec.businessName}`.trim();
  const out: RetrievedComponentRef[] = [];
  const seen = new Set<string>();

  logInfo("retrieve for SiteSpec", {
    business: spec.businessName,
    roles: [...needed],
  });

  for (const { role, query } of ROLE_QUERIES) {
    if (!needed.has(role)) continue;
    try {
      const hits = await mcp.search({
        query: `${query} ${styleHint}`,
        role,
        limit: 3,
      });
      const best = hits.find((h) => !seen.has(h.id)) ?? hits[0];
      if (!best) {
        logWarn("no search hits for role", { role });
        continue;
      }
      seen.add(best.id);
      let full = { ...best, category: role };
      try {
        const got = await mcp.getComponent(best.id);
        if (got) {
          full = {
            ...got,
            category: role,
            // Keep search name if get is sparse
            name: got.name || best.name,
          };
        }
      } catch (err) {
        logWarn("get_component failed; keeping search hit", {
          role,
          id: best.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      out.push(full);
      logInfo("selected component", {
        role,
        id: full.id,
        name: full.name,
        hasCode: Boolean(full.codeSnippet?.trim()),
      });
    } catch (err) {
      logWarn("retrieve role failed", {
        role,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const withCode = out.filter((c) => c.codeSnippet?.trim());
  if (out.length === 0) {
    logWarn("no components selected — catalog fallback", {
      tools: mcp.discoveredTools,
    });
    return {
      components: [],
      usedFallback: true,
      connected: mcp.isConnected,
      toolsDiscovered: mcp.discoveredTools,
      error: "empty 21st results",
    };
  }

  logInfo("retrieval complete", {
    selected: out.length,
    withCode: withCode.length,
    ids: out.map((c) => `${c.category}:${c.id}`),
    fallback: withCode.length === 0,
  });

  return {
    // Prefer entries that have source; still return ids for Codex to fetch via tools
    components: out,
    usedFallback: withCode.length === 0,
    connected: mcp.isConnected,
    toolsDiscovered: mcp.discoveredTools,
  };
}

/** Format retrieved components for the coding agent prompt. */
export function formatRetrievedComponentsForCodex(
  components: RetrievedComponentRef[],
): string {
  if (!components.length) return "(no 21st components retrieved)";
  return components
    .map((c) => {
      const code = (c.codeSnippet || "").trim();
      const body = code
        ? code.slice(0, 6000)
        : `(no inline code — call build.component.get with id "${c.id}" if needed)`;
      return [
        `### ${c.category}: ${c.name}`,
        `- id: ${c.id}`,
        `- source: 21st.dev`,
        `- sandbox path hint: components/twenty-first/${c.category}-${slugify(c.id)}.tsx`,
        "```tsx",
        body,
        "```",
      ].join("\n");
    })
    .join("\n\n");
}

function slugify(id: string): string {
  return id
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "component";
}

export function vendorPathForComponent(c: RetrievedComponentRef): string {
  return `components/twenty-first/${c.category}-${slugify(c.id)}.tsx`;
}

/**
 * Turn retrieved snippets into sandbox files the agent must adapt.
 */
export function retrievedComponentsToScaffoldFiles(
  components: RetrievedComponentRef[],
): Array<{ path: string; content: string }> {
  const files: Array<{ path: string; content: string }> = [];
  const indexLines = [
    "/** Auto-retrieved from 21st.dev for this build — adapt into the site; do not leave unused. */",
    "",
  ];
  for (const c of components) {
    const code = c.codeSnippet?.trim();
    if (!code) continue;
    const path = vendorPathForComponent(c);
    const banner = [
      `/* 21st.dev component`,
      ` * id: ${c.id}`,
      ` * name: ${c.name}`,
      ` * role: ${c.category}`,
      ` * Adapt props/copy/tokens to SiteSpec; keep structure.`,
      ` */`,
      "",
    ].join("\n");
    files.push({ path, content: `${banner}${code}\n` });
    indexLines.push(
      `// ${c.category}: ${c.name} (${c.id}) → ${path}`,
    );
  }
  if (files.length) {
    files.push({
      path: "components/twenty-first/README.md",
      content: [
        "# 21st.dev components for this build",
        "",
        "These files were retrieved via the 21st MCP (`search` + `get_component`).",
        "Codex should import/adapt them into the App Router pages instead of inventing new section markup from scratch.",
        "",
        ...indexLines.filter((l) => l.startsWith("//")),
        "",
      ].join("\n"),
    });
  }
  return files;
}
