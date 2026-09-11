// Website CREATE: search/fetch/compare/select a complete 21st.dev TEMPLATE,
// install its code as the visual foundation, then let the component agent
// fill gaps. Failures return a soft fallback — never throw (build continues).

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const TEMPLATE_ROOT = "components/twenty-first/template";

/**
 * @param {{
 *   twentyFirst: import("./twenty-first.mjs").TwentyFirstClient,
 *   log: import("./events.mjs").EventLog,
 *   projectSpec?: Record<string, unknown>|null,
 *   projectName?: string,
 *   deadlineMs: number,
 *   repoDir?: string|null,
 * }} opts
 * @returns {Promise<{
 *   selected: Record<string, unknown>|null,
 *   candidates: Array<Record<string, unknown>>,
 *   designSystem: Record<string, unknown>,
 *   markdown: string,
 *   stats: { searches: number, fetches: number, selected: number, templateUsed: boolean },
 *   fallbackReason?: string,
 * }>}
 */
export async function runTemplateAgent(opts) {
  const empty = {
    selected: null,
    candidates: [],
    designSystem: {
      source: "native",
      fallbackReason: "twenty_first_unavailable",
      updatedAt: new Date().toISOString(),
    },
    markdown: "",
    stats: { searches: 0, fetches: 0, selected: 0, templateUsed: false },
    fallbackReason: "twenty_first_unavailable",
  };
  if (!opts.twentyFirst) return empty;

  const queries = buildTemplateQueries(opts.projectSpec, opts.projectName);
  opts.log.emit("progress", "Finding the right design…", { phase: "twenty_first_template" });
  opts.log.emit("progress", "Reviewing website templates…", { phase: "twenty_first_template" });

  /** @type {Array<{ query: string, hit: any }>} */
  const pool = [];
  let searches = 0;
  for (const query of queries) {
    if (Date.now() > opts.deadlineMs - 3 * 60_000) break;
    let hits = [];
    try {
      hits = await opts.twentyFirst.search(query, 5, { type: "template" });
      searches += 1;
    } catch (err) {
      opts.log.emit("log", `21st template search failed: ${err?.message || err}`);
      continue;
    }
    for (const hit of hits) {
      if (pool.some((p) => p.hit.id === hit.id)) continue;
      pool.push({ query, hit });
    }
    if (pool.length >= 8) break;
  }

  if (!pool.length) {
    // Soft retry with broader queries once.
    const broad = [
      "modern marketing website template",
      "premium company landing page template",
      "minimal SaaS website template",
    ];
    for (const query of broad) {
      if (Date.now() > opts.deadlineMs - 3 * 60_000) break;
      try {
        const hits = await opts.twentyFirst.search(query, 5, { type: "template" });
        searches += 1;
        for (const hit of hits) {
          if (pool.some((p) => p.hit.id === hit.id)) continue;
          pool.push({ query, hit });
        }
      } catch {
        /* continue */
      }
      if (pool.length >= 5) break;
    }
  }

  if (!pool.length) {
    opts.log.emit("progress", "Preparing your design…", {
      phase: "twenty_first_template",
      detail: "No suitable template — using components",
    });
    return {
      ...empty,
      designSystem: {
        source: "native",
        fallbackReason: "no_suitable_template",
        updatedAt: new Date().toISOString(),
      },
      fallbackReason: "no_suitable_template",
      stats: { searches, fetches: 0, selected: 0, templateUsed: false },
      markdown: "No 21st templates matched — fall back to component composition.",
    };
  }

  // Fetch up to 5 distinct candidates for comparison.
  const toFetch = pool.slice(0, 5);
  opts.log.emit("progress", "Reviewing website templates…", {
    phase: "twenty_first_template",
    detail: `Comparing ${toFetch.length} templates`,
  });

  /** @type {Array<{ hit: any, query: string, artifact: any, score: number, reason: string }>} */
  const fetched = [];
  let fetches = 0;
  for (const item of toFetch) {
    if (Date.now() > opts.deadlineMs - 2 * 60_000) break;
    let artifact = null;
    try {
      artifact = await opts.twentyFirst.get(item.hit.id, { type: "template" });
      fetches += 1;
    } catch (err) {
      opts.log.emit("log", `21st template get failed (${item.hit.id}): ${err?.message || err}`);
      continue;
    }
    if (!artifact?.code && !(artifact?.files?.length)) continue;
    const scored = scoreTemplate(artifact, item.hit, opts.projectSpec, item.query);
    fetched.push({
      hit: item.hit,
      query: item.query,
      artifact,
      score: scored.score,
      reason: scored.reason,
    });
  }

  if (!fetched.length) {
    return {
      ...empty,
      designSystem: {
        source: "native",
        fallbackReason: "template_fetch_failed",
        updatedAt: new Date().toISOString(),
      },
      fallbackReason: "template_fetch_failed",
      stats: { searches, fetches, selected: 0, templateUsed: false },
      markdown: "Template candidates found but none could be fetched — fall back to components.",
    };
  }

  fetched.sort((a, b) => b.score - a.score);
  const winner = fetched[0];
  const installed = installTemplate(opts.repoDir, winner.artifact, winner.hit);
  if (!installed.ok) {
    return {
      ...empty,
      designSystem: {
        source: "native",
        fallbackReason: "template_incompatible",
        updatedAt: new Date().toISOString(),
      },
      fallbackReason: "template_incompatible",
      stats: { searches, fetches, selected: 0, templateUsed: false },
      markdown: `Selected template ${winner.hit.id} but could not install files — fall back to components.`,
    };
  }

  opts.log.emit("progress", "Preparing your design…", {
    phase: "twenty_first_template",
    detail: winner.hit.name,
  });
  opts.log.emit("progress", "Customizing the template…", { phase: "twenty_first_template" });

  const selected = {
    source: "21st",
    kind: "template",
    componentId: String(winner.artifact.id || winner.hit.id),
    name: String(winner.artifact.name || winner.hit.name || winner.hit.id),
    purpose: "site_template",
    reason: winner.reason,
    localPath: installed.root,
    files: installed.files,
    dependencies: winner.artifact.dependencies || [],
    adaptationInstructions: [
      "This template is the visual foundation of the website.",
      "Adapt brand name, copy, CTAs, colors, imagery, routes, and forms to the business.",
      "Preserve proportions, section rhythm, hierarchy, typography relationships, responsive behavior, and interaction patterns.",
      "Replace all demo/template company names, fake testimonials, lorem ipsum, and demo links.",
      "Normalize tokens to app/globals.css. Replace unreliable template media with /public/assets/… or intentional placeholders.",
      "Do not redesign from scratch. Do not invent a new hero/nav/footer when the template already provides them.",
    ].join(" "),
  };

  const designSystem = {
    source: "21st",
    templateId: selected.componentId,
    templateName: selected.name,
    templateReason: selected.reason,
    templateFiles: installed.files,
    templateRoot: installed.root,
    dependencies: selected.dependencies,
    designTokens: extractTokenHints(opts.projectSpec),
    layoutRules: {
      shell: "Reuse template navbar/footer on every route",
      spacing: "Match template section rhythm and container width",
      hierarchy: "Preserve template heading/body scale relationships",
    },
    pagePatterns: {
      home: "Adapt template landing structure for /",
      inner: "Clone closest existing page grammar for new routes",
    },
    componentPatterns: {
      prefer: "template components, then 21st gap fills, native last",
    },
    components: {
      navbar: `${installed.root} (nav)`,
      footer: `${installed.root} (footer)`,
      heroPatterns: [`${installed.root} (hero)`],
    },
    referenceRoutes: ["/"],
    updatedAt: new Date().toISOString(),
  };

  const markdown = [
    `## Selected 21st template`,
    `- id=${selected.componentId}`,
    `- name=${selected.name}`,
    `- reason=${selected.reason}`,
    `- root=${installed.root}`,
    `- files=${installed.files.length}`,
    "",
    "### Candidates compared",
    ...fetched.map(
      (f, i) =>
        `${i + 1}. ${f.hit.name || f.hit.id} (score ${f.score}) — ${f.reason}`,
    ),
    "",
    "### Adaptation",
    selected.adaptationInstructions,
  ].join("\n");

  return {
    selected,
    candidates: fetched.map((f) => ({
      id: f.hit.id,
      name: f.hit.name,
      score: f.score,
      reason: f.reason,
      query: f.query,
    })),
    designSystem,
    markdown,
    stats: { searches, fetches, selected: 1, templateUsed: true },
  };
}

/**
 * Build targeted template search queries from the design brief / spec.
 */
export function buildTemplateQueries(projectSpec, projectName) {
  const spec = projectSpec || {};
  const brief = spec.designBrief || {};
  const purpose = String(brief.purpose || spec.intent || projectName || "company").slice(0, 80);
  const style = String(brief.styleDirection || spec.visual?.direction || "modern").toLowerCase();
  const color = String(brief.colorDirection || spec.visual?.palette?.mode || "").toLowerCase();
  const goal = String(brief.primaryGoal || "").toLowerCase();
  const dark = /dark/.test(color) || /dark|premium|technical/.test(style);
  const mood = /editorial/.test(style)
    ? "editorial"
    : /playful/.test(style)
      ? "playful"
      : /minimal/.test(style)
        ? "minimal"
        : /bold/.test(style)
          ? "bold"
          : /premium|technical/.test(style)
            ? "premium"
            : "modern";

  const niche = purpose
    .replace(/[^a-zA-Z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 48);

  const queries = [
    `${dark ? "dark " : ""}${mood} ${niche} website template`.replace(/\s+/g, " ").trim(),
    `${mood} ${niche} landing page template`.replace(/\s+/g, " ").trim(),
    `${dark ? "dark premium " : ""}${niche} company website`.replace(/\s+/g, " ").trim(),
    `${mood} marketing website template`,
    /portfolio|studio|architect|design/i.test(purpose)
      ? `${mood} portfolio website template`
      : /saas|software|product/i.test(purpose) || /signup|trial|demo/.test(goal)
        ? `${mood} SaaS marketing website template`
        : `${mood} local service business website template`,
  ];
  return [...new Set(queries.map((q) => q.replace(/\s+/g, " ").trim()).filter(Boolean))].slice(0, 6);
}

export function scoreTemplate(artifact, hit, projectSpec, query) {
  const brief = projectSpec?.designBrief || {};
  const style = String(brief.styleDirection || projectSpec?.visual?.direction || "").toLowerCase();
  const purpose = String(brief.purpose || projectSpec?.intent || "").toLowerCase();
  const blob = `${hit.name || ""} ${hit.description || ""} ${artifact.name || ""} ${artifact.code || ""} ${query || ""}`
    .toLowerCase()
    .slice(0, 8000);

  let score = 1;
  const reasons = [];
  if (artifact.files?.length > 1) {
    score += 4;
    reasons.push("multi-file template");
  } else if ((artifact.code || "").length > 1500) {
    score += 3;
    reasons.push("substantial single-file landing");
  }
  for (const token of style.split(/[^a-z0-9]+/).filter((t) => t.length > 3)) {
    if (blob.includes(token)) {
      score += 1;
      reasons.push(`matches style “${token}”`);
    }
  }
  for (const token of purpose.split(/[^a-z0-9]+/).filter((t) => t.length > 4).slice(0, 6)) {
    if (blob.includes(token)) {
      score += 1;
      reasons.push(`matches business “${token}”`);
    }
  }
  if (/nav|header|footer|hero/i.test(blob)) {
    score += 2;
    reasons.push("has core shell sections");
  }
  if (/purple|indigo gradient|glassmorphism|lorem ipsum/i.test(blob)) score -= 1;
  if ((artifact.dependencies || []).length > 12) {
    score -= 1;
    reasons.push("heavy dependency tree");
  }

  return {
    score,
    reason: reasons.slice(0, 4).join("; ") || `Best fit for “${query}”`,
  };
}

function extractTokenHints(projectSpec) {
  const palette = projectSpec?.visual?.palette || projectSpec?.designBrief?.designTokens || {};
  const out = {};
  for (const [k, v] of Object.entries(palette)) {
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return out;
}

/**
 * Install template artifact under components/twenty-first/template/.
 */
export function installTemplate(repoDir, artifact, hit) {
  const root = TEMPLATE_ROOT;
  /** @type {string[]} */
  const written = [];
  if (!repoDir) {
    return { ok: false, root, files: written };
  }
  try {
    mkdirSync(join(repoDir, root), { recursive: true });
    const files =
      Array.isArray(artifact.files) && artifact.files.length
        ? artifact.files
        : [
            {
              path: "Landing.tsx",
              content:
                artifact.code ||
                `export default function TemplateLanding(){return null}\n`,
            },
          ];

    for (const f of files) {
      const rel = sanitizeTemplatePath(f.path);
      if (!rel) continue;
      const abs = join(repoDir, root, rel);
      mkdirSync(dirname(abs), { recursive: true });
      const header =
        rel.endsWith(".tsx") || rel.endsWith(".ts") || rel.endsWith(".jsx") || rel.endsWith(".js")
          ? `/**\n * 21st.dev template source — adapt; do not ship demo content verbatim.\n * id=${artifact.id || hit?.id || ""}\n * name=${artifact.name || hit?.name || ""}\n */\n`
          : "";
      writeFileSync(abs, `${header}${f.content}\n`, "utf8");
      written.push(`${root}/${rel}`);
    }

    writeFileSync(
      join(repoDir, root, "README.md"),
      [
        `# 21st template: ${artifact.name || hit?.name || artifact.id}`,
        "",
        `id: \`${artifact.id || hit?.id}\``,
        "",
        "This directory is the **visual foundation** for the site.",
        "Adapt into `app/` and `components/site/*`, normalize to project tokens,",
        "replace demo media/copy, then remove unused template leftovers.",
        "",
      ].join("\n"),
      "utf8",
    );
    written.push(`${root}/README.md`);
    return { ok: written.length > 0, root, files: written };
  } catch {
    return { ok: false, root, files: written };
  }
}

function sanitizeTemplatePath(path) {
  const p = String(path || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/^(\.\.\/)+/g, "");
  if (!p || p.includes("..") || p.startsWith("node_modules")) return null;
  // Keep paths shallow and safe.
  return p.split("/").slice(-3).join("/").slice(0, 120);
}

/**
 * Infer missing section purposes after a template is selected.
 */
export function inferMissingComponentPurposes(projectSpec, templateCodeBlob) {
  const blob = String(templateCodeBlob || "").toLowerCase();
  const features = (Array.isArray(projectSpec?.features) ? projectSpec.features : []).map((f) =>
    String(f).toLowerCase(),
  );
  const pages = (Array.isArray(projectSpec?.pages) ? projectSpec.pages : []).map((p) =>
    String(p.path || "").toLowerCase(),
  );
  /** @type {string[]} */
  const missing = [];
  const need = (purpose, test) => {
    if (!test(blob) && !missing.includes(purpose)) missing.push(purpose);
  };
  need("faq", (b) => /faq|accordion/.test(b));
  need("contact", (b) => /contact|form/.test(b));
  if (features.some((f) => /testimonial/.test(f))) need("testimonials", (b) => /testimonial|review/.test(b));
  if (features.some((f) => /pricing/.test(f)) || pages.includes("/pricing")) {
    need("pricing", (b) => /pricing|plan/.test(b));
  }
  if (features.some((f) => /gallery|team/.test(f)) || pages.includes("/work") || pages.includes("/team")) {
    need("gallery", (b) => /gallery|grid|team/.test(b));
  }
  // Always ensure shell pieces exist in some form — if template lacks them, fetch.
  if (!/nav|header/.test(blob)) missing.unshift("nav");
  if (!/footer/.test(blob)) missing.push("footer");
  if (!/hero/.test(blob)) missing.unshift("hero");
  return missing.slice(0, 6);
}
