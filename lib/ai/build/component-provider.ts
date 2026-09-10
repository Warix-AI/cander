/**
 * @deprecated Dormant V1 component path. Live website builds use the single
 * 21st.dev MCP proxy path: builder/twenty-first.mjs → /api/build-jobs/[jobId]/twenty-first
 * (server: lib/ai/build/twenty-first-mcp.ts). Kept only for the legacy
 * tool-executor surface; do not extend.
 */
/**
 * ComponentProvider abstraction — search/get/install.
 * Priority: project → Cander cache → 21st → compose → generate → escalate.
 */

export type ComponentCandidate = {
  id: string;
  name: string;
  category: string;
  compatibility: string[];
  previewMetadata?: Record<string, string>;
  dependencies?: string[];
  designTags?: string[];
  source: "project" | "cander" | "twenty_first" | "composed" | "generated";
};

export type ComponentProvider = {
  id: string;
  search(query: string, opts?: { role?: string; limit?: number }): Promise<ComponentCandidate[]>;
  get(id: string): Promise<ComponentCandidate | null>;
  install(
    id: string,
    ctx: { projectId: string; designTokens?: Record<string, string> },
  ): Promise<{ ok: boolean; filesWritten: string[]; error?: string }>;
};

const CANDER_CACHE: ComponentCandidate[] = [
  {
    id: "cander.hero.saas",
    name: "SaaS Hero",
    category: "hero",
    compatibility: ["site", "app"],
    designTags: ["professional", "saas"],
    source: "cander",
  },
  {
    id: "cander.hero.local",
    name: "Local Business Hero",
    category: "hero",
    compatibility: ["site"],
    designTags: ["local", "trust"],
    source: "cander",
  },
  {
    id: "cander.pricing.three",
    name: "Three-tier Pricing",
    category: "pricing",
    compatibility: ["site", "app"],
    designTags: ["pricing"],
    source: "cander",
  },
  {
    id: "cander.testimonials.local",
    name: "Local Testimonials",
    category: "reviews",
    compatibility: ["site"],
    designTags: ["testimonials"],
    source: "cander",
  },
  {
    id: "cander.sidebar.dashboard",
    name: "Dashboard Sidebar",
    category: "sidebar",
    compatibility: ["dashboard", "app"],
    designTags: ["dashboard"],
    source: "cander",
  },
];

/** Fixture / Cander-approved cache provider (default for tests + P0/P1). */
export function createCanderCacheComponentProvider(): ComponentProvider {
  return {
    id: "cander_cache",
    async search(query, opts) {
      const limit = Math.min(opts?.limit ?? 5, 5);
      const q = query.toLowerCase();
      const role = opts?.role?.toLowerCase();
      const scored = CANDER_CACHE.map((c) => {
        let score = 0;
        if (role && c.category === role) score += 5;
        if (c.name.toLowerCase().includes(q)) score += 3;
        if (c.designTags?.some((t) => q.includes(t))) score += 2;
        if (c.category && q.includes(c.category)) score += 2;
        return { c, score };
      })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((x) => x.c);
      if (scored.length) return scored;
      return CANDER_CACHE.filter((c) => !role || c.category === role).slice(
        0,
        limit,
      );
    },
    async get(id) {
      return CANDER_CACHE.find((c) => c.id === id) ?? null;
    },
    async install(id) {
      const c = CANDER_CACHE.find((x) => x.id === id);
      if (!c) return { ok: false, filesWritten: [], error: "not_found" };
      return {
        ok: true,
        filesWritten: [`src/components/${c.category}/${c.id}.tsx`],
      };
    },
  };
}

/**
 * 21st.dev provider — real MCP when API_KEY_21ST / TWENTY_FIRST_API_KEY is set;
 * otherwise falls back to Cander cache stand-ins.
 */
export function createTwentyFirstDevProvider(): ComponentProvider {
  return {
    id: "twenty_first_dev",
    async search(query, opts) {
      try {
        const {
          getActiveTwentyFirstClient,
          createTwentyFirstMcpClient,
          setActiveTwentyFirstClient,
          isTwentyFirstConfigured,
        } = await import("@/lib/ai/build/twenty-first-mcp");
        if (isTwentyFirstConfigured()) {
          let client = getActiveTwentyFirstClient();
          if (!client) {
            client = await createTwentyFirstMcpClient();
            if (client) setActiveTwentyFirstClient(client);
          }
          if (client) {
            const hits = await client.search({
              query,
              role: opts?.role,
              limit: opts?.limit ?? 5,
            });
            return hits.map((h) => ({
              id: h.id,
              name: h.name,
              category: opts?.role || h.category,
              compatibility: ["site", "app"],
              dependencies: h.dependencies,
              source: "twenty_first" as const,
            }));
          }
        }
      } catch (err) {
        console.warn("[cander:21st-mcp] provider search fallback", err);
      }
      const cache = createCanderCacheComponentProvider();
      const base = await cache.search(query, opts);
      return base.slice(0, 5).map((c) => ({
        ...c,
        id: `21st.${c.id}`,
        source: "twenty_first" as const,
        name: `${c.name} (21st unavailable — catalog stand-in)`,
      }));
    },
    async get(id) {
      try {
        const {
          getActiveTwentyFirstClient,
          createTwentyFirstMcpClient,
          setActiveTwentyFirstClient,
          isTwentyFirstConfigured,
        } = await import("@/lib/ai/build/twenty-first-mcp");
        if (isTwentyFirstConfigured()) {
          let client = getActiveTwentyFirstClient();
          if (!client) {
            client = await createTwentyFirstMcpClient();
            if (client) setActiveTwentyFirstClient(client);
          }
          if (client) {
            const hit = await client.getComponent(id.replace(/^21st\./, ""));
            if (hit) {
              return {
                id: hit.id,
                name: hit.name,
                category: hit.category,
                compatibility: ["site", "app"],
                dependencies: hit.dependencies,
                source: "twenty_first" as const,
              };
            }
          }
        }
      } catch (err) {
        console.warn("[cander:21st-mcp] provider get fallback", err);
      }
      const cache = createCanderCacheComponentProvider();
      const inner = id.replace(/^21st\./, "");
      const c = await cache.get(inner);
      if (!c) return null;
      return { ...c, id, source: "twenty_first", name: `${c.name} (21st)` };
    },
    async install(id, ctx) {
      const cache = createCanderCacheComponentProvider();
      const inner = id.replace(/^21st\./, "");
      const result = await cache.install(inner, ctx);
      if (!result.ok) return result;
      return {
        ok: true,
        filesWritten: [
          ...result.filesWritten,
          "src/styles/tokens.normalized.css",
        ],
      };
    },
  };
}

export type ComponentSearchPriority =
  | "project"
  | "cander"
  | "twenty_first"
  | "composed"
  | "generated"
  | "escalate";

/**
 * Bounded search across providers — max 3–5 candidates, no raw source.
 */
export async function searchComponentsBounded(opts: {
  query: string;
  role?: string;
  projectComponents?: ComponentCandidate[];
  providers?: ComponentProvider[];
  limit?: number;
}): Promise<ComponentCandidate[]> {
  const limit = Math.min(opts.limit ?? 5, 5);
  const out: ComponentCandidate[] = [];

  for (const c of opts.projectComponents ?? []) {
    if (opts.role && c.category !== opts.role) continue;
    out.push(c);
    if (out.length >= limit) return out;
  }

  const providers =
    opts.providers ??
    [
      createCanderCacheComponentProvider(),
      ...(process.env.NEXT_PUBLIC_AI_BUILD_21ST === "1" ||
      process.env.API_KEY_21ST ||
      process.env.TWENTY_FIRST_API_KEY
        ? [createTwentyFirstDevProvider()]
        : []),
    ];

  for (const p of providers) {
    const found = await p.search(opts.query, { role: opts.role, limit });
    for (const c of found) {
      if (out.some((x) => x.id === c.id)) continue;
      out.push(c);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** Map imported component styles onto BuildSpec design tokens (deterministic). */
export function normalizeComponentToDesignTokens(
  _source: string,
  tokens: Record<string, string>,
): string {
  const lines = [
    "/* normalized to BuildSpec design tokens */",
    ...Object.entries(tokens).map(([k, v]) => `  --${k}: ${v};`),
  ];
  return `:root {\n${lines.join("\n")}\n}\n`;
}
