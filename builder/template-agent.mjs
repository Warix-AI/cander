// Website CREATE: search/fetch/compare/select a complete 21st.dev TEMPLATE,
// install its code as the visual foundation, then let the component agent
// fill gaps. Native visual generation is NOT a fallback unless explicitly
// allowed via CANDER_ALLOW_NATIVE_SITE_UI.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { writeUiManifest } from "./ui-source.mjs";

const TEMPLATE_ROOT = "components/twenty-first/template";

/**
 * @param {{
 *   twentyFirst: import("./twenty-first.mjs").TwentyFirstClient,
 *   log: import("./events.mjs").EventLog,
 *   projectSpec?: Record<string, unknown>|null,
 *   projectName?: string,
 *   deadlineMs: number,
 *   repoDir?: string|null,
 *   allowNativeSiteUi?: boolean,
 * }} opts
 * @returns {Promise<{
 *   selected: Record<string, unknown>|null,
 *   candidates: Array<Record<string, unknown>>,
 *   designSystem: Record<string, unknown>,
 *   markdown: string,
 *   stats: Record<string, number|boolean|string|null>,
 *   fallbackReason?: string,
 *   abort?: boolean,
 *   abortReason?: string,
 * }>}
 */
export async function runTemplateAgent(opts) {
  const allowNative = Boolean(opts.allowNativeSiteUi);
  const unavailable = (reason) => ({
    selected: null,
    candidates: [],
    designSystem: allowNative
      ? {
          source: "native",
          fallbackReason: reason,
          updatedAt: new Date().toISOString(),
        }
      : {
          source: "21st",
          fallbackReason: reason,
          updatedAt: new Date().toISOString(),
        },
    markdown: "",
    stats: {
      searches: 0,
      fetches: 0,
      selected: 0,
      templateUsed: false,
      templateFetched: false,
      templateInstalled: false,
      templateRendered: false,
      nativeUiUsed: allowNative,
    },
    fallbackReason: reason,
    abort: !allowNative,
    abortReason: reason === "twenty_first_unavailable" || reason === "ui_source_unavailable"
      ? reason
      : "ui_source_unavailable",
  });

  if (!opts.twentyFirst) return unavailable("twenty_first_unavailable");

  const queryPasses = buildProgressiveTemplateQueries(opts.projectSpec, opts.projectName);
  opts.log.emit("progress", "Finding the right website design…", { phase: "twenty_first_template" });
  opts.log.emit("progress", "Reviewing design options…", { phase: "twenty_first_template" });

  /** @type {Array<{ query: string, pass: number, hit: any }>} */
  const pool = [];
  let searches = 0;

  for (let pass = 0; pass < queryPasses.length; pass++) {
    // Need a little wall-clock left to fetch; don't require a full 3 minutes
    // up front or short test/planning budgets skip every search.
    if (Date.now() > opts.deadlineMs - 30_000) break;
    const queries = queryPasses[pass];
    for (const query of queries) {
      if (Date.now() > opts.deadlineMs - 20_000) break;
      let hits = [];
      try {
        hits = await opts.twentyFirst.search(query, 5, { type: "template" });
        searches += 1;
      } catch (err) {
        opts.log.emit("log", `21st template search failed (pass ${pass + 1}): ${err?.message || err}`);
        continue;
      }
      for (const hit of hits) {
        if (pool.some((p) => p.hit.id === hit.id)) continue;
        pool.push({ query, pass: pass + 1, hit });
      }
    }
    // After pass 1, if we already have several candidates, still run one broader
    // pass for diversity — but we never stop at "no industry match".
    if (pool.length >= 10) break;
  }

  if (!pool.length) {
    opts.log.emit("progress", "Design resources unavailable…", {
      phase: "twenty_first_template",
      detail: "No templates returned",
    });
    return unavailable("ui_source_unavailable");
  }

  // Fetch many candidates — prefer structural usability over demo industry.
  const toFetch = pool.slice(0, 8);
  opts.log.emit("progress", "Reviewing design options…", {
    phase: "twenty_first_template",
    detail: `Comparing ${toFetch.length} templates`,
  });

  /** @type {Array<{ hit: any, query: string, pass: number, artifact: any, score: number, reason: string }>} */
  const fetched = [];
  let fetches = 0;
  for (const item of toFetch) {
    if (Date.now() > opts.deadlineMs - 15_000) break;
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
      pass: item.pass,
      artifact,
      score: scored.score,
      reason: scored.reason,
    });
  }

  // If first batch failed to fetch, try remaining pool ids.
  if (!fetched.length && pool.length > toFetch.length) {
    for (const item of pool.slice(toFetch.length, toFetch.length + 5)) {
      if (Date.now() > opts.deadlineMs - 15_000) break;
      try {
        const artifact = await opts.twentyFirst.get(item.hit.id, { type: "template" });
        fetches += 1;
        if (!artifact?.code && !(artifact?.files?.length)) continue;
        const scored = scoreTemplate(artifact, item.hit, opts.projectSpec, item.query);
        fetched.push({
          hit: item.hit,
          query: item.query,
          pass: item.pass,
          artifact,
          score: scored.score,
          reason: scored.reason,
        });
      } catch {
        /* continue */
      }
    }
  }

  if (!fetched.length) {
    return unavailable("ui_source_unavailable");
  }

  // ALWAYS pick the closest usable template — never "no_suitable_template → native".
  fetched.sort((a, b) => b.score - a.score);
  let winner = null;
  /** @type {string[]} */
  const installErrors = [];
  for (const candidate of fetched) {
    const installed = installTemplate(opts.repoDir, candidate.artifact, candidate.hit);
    if (installed.ok) {
      winner = { candidate, installed };
      break;
    }
    installErrors.push(String(candidate.hit.id));
  }

  if (!winner) {
    return unavailable("ui_source_unavailable");
  }

  const { candidate, installed } = winner;
  opts.log.emit("progress", "Preparing your website structure…", {
    phase: "twenty_first_template",
    detail: candidate.hit.name,
  });
  opts.log.emit("progress", "Customizing your design…", { phase: "twenty_first_template" });

  const selected = {
    source: "21st",
    kind: "template",
    sourceType: "21st_template",
    componentId: String(candidate.artifact.id || candidate.hit.id),
    name: String(candidate.artifact.name || candidate.hit.name || candidate.hit.id),
    purpose: "site_template",
    reason: candidate.reason,
    localPath: installed.root,
    files: installed.files,
    dependencies: candidate.artifact.dependencies || [],
    adaptationInstructions: [
      "This template is the REQUIRED visual foundation of the website.",
      "You may NOT invent a parallel visual design.",
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
      prefer: "template components first, then 21st gap fills, then derive — never invent visual UI",
    },
    components: {
      navbar: `${installed.root} (nav)`,
      footer: `${installed.root} (footer)`,
      heroPatterns: [`${installed.root} (hero)`],
      pageShell: installed.root,
    },
    provenance: {
      template: {
        sourceType: "21st_template",
        sourceId: selected.componentId,
        path: installed.root,
      },
    },
    referenceRoutes: ["/"],
    updatedAt: new Date().toISOString(),
  };

  writeUiManifest(opts.repoDir, {
    template: {
      id: selected.componentId,
      name: selected.name,
      files: installed.files,
      root: installed.root,
      reason: selected.reason,
    },
    approvedComponents: [],
    rules: {
      noNativeVisualUi: !allowNative,
      deriveBeforeSearch: true,
      preserveTemplateDesign: true,
    },
  });

  const markdown = [
    `## Selected 21st template`,
    `- id=${selected.componentId}`,
    `- name=${selected.name}`,
    `- reason=${selected.reason}`,
    `- root=${installed.root}`,
    `- files=${installed.files.length}`,
    `- searchPass=${candidate.pass}`,
    "",
    "### Candidates compared",
    ...fetched.map(
      (f, i) =>
        `${i + 1}. ${f.hit.name || f.hit.id} (score ${f.score}, pass ${f.pass}) — ${f.reason}`,
    ),
    installErrors.length
      ? `\n(Skipped uninstallable candidates: ${installErrors.join(", ")})`
      : "",
    "",
    "### Adaptation",
    selected.adaptationInstructions,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    selected,
    candidates: fetched.map((f) => ({
      id: f.hit.id,
      name: f.hit.name,
      score: f.score,
      reason: f.reason,
      query: f.query,
      pass: f.pass,
    })),
    designSystem,
    markdown,
    stats: {
      searches,
      fetches,
      selected: 1,
      templateUsed: true,
      templateFetched: true,
      templateInstalled: true,
      templateRendered: false, // coder must render; acceptance verifies
      nativeUiUsed: false,
    },
  };
}

/**
 * Progressive query passes: niche → style → structural → broad.
 * Industry mismatch must NOT end the search.
 */
export function buildProgressiveTemplateQueries(projectSpec, projectName) {
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

  const pass1 = [
    `${dark ? "dark " : ""}${mood} ${niche} website template`,
    `${mood} ${niche} landing page template`,
    `${niche} company website template`,
  ];
  const pass2 = [
    `${dark ? "dark " : ""}${mood} technical corporate website`,
    `${dark ? "dark premium " : "premium "}${mood} company landing page`,
    `${mood} ${dark ? "dark " : ""}business website template`,
  ];
  const pass3 = [
    `${mood} technology landing page template`,
    `${dark ? "dark " : ""}premium SaaS marketing website template`,
    `editorial business website template`,
  ];
  const pass4 = [
    /portfolio|studio|architect|design/i.test(purpose)
      ? `${mood} portfolio website template`
      : /saas|software|product/i.test(purpose) || /signup|trial|demo/.test(goal)
        ? `${mood} SaaS marketing website template`
        : `${mood} local service business website template`,
    `modern company website template`,
    `minimal marketing website template`,
  ];
  const pass5 = [
    "modern marketing website template",
    "premium company landing page template",
    "minimal SaaS website template",
    "startup landing page template",
    "agency portfolio website template",
  ];

  const normalize = (arr) =>
    [...new Set(arr.map((q) => q.replace(/\s+/g, " ").trim()).filter(Boolean))];

  return [normalize(pass1), normalize(pass2), normalize(pass3), normalize(pass4), normalize(pass5)];
}

/** @deprecated use buildProgressiveTemplateQueries — kept for tests */
export function buildTemplateQueries(projectSpec, projectName) {
  return buildProgressiveTemplateQueries(projectSpec, projectName).flat().slice(0, 8);
}

/**
 * Structural suitability first; demo industry match is a weak bonus only.
 */
export function scoreTemplate(artifact, hit, projectSpec, query) {
  const brief = projectSpec?.designBrief || {};
  const style = String(brief.styleDirection || projectSpec?.visual?.direction || "").toLowerCase();
  const purpose = String(brief.purpose || projectSpec?.intent || "").toLowerCase();
  const color = String(brief.colorDirection || "").toLowerCase();
  const blob = `${hit.name || ""} ${hit.description || ""} ${artifact.name || ""} ${artifact.code || ""} ${(artifact.files || [])
    .map((f) => f.content || "")
    .join(" ")
    .slice(0, 4000)} ${query || ""}`
    .toLowerCase()
    .slice(0, 12_000);

  let score = 2; // every fetchable template is usable by default
  const reasons = [];

  if (artifact.files?.length > 1) {
    score += 5;
    reasons.push("multi-file template");
  } else if ((artifact.code || "").length > 2500) {
    score += 4;
    reasons.push("substantial landing");
  } else if ((artifact.code || "").length > 800) {
    score += 2;
    reasons.push("usable single-file landing");
  }

  // Structural coverage (primary).
  const shellBits = [
    [/nav|header/i, "nav"],
    [/hero|headline|above.?the.?fold/i, "hero"],
    [/footer/i, "footer"],
    [/feature|benefit|service/i, "features"],
    [/cta|call.?to.?action|button/i, "cta"],
  ];
  let shellHits = 0;
  for (const [re, label] of shellBits) {
    if (re.test(blob)) {
      shellHits += 1;
      score += 2;
      reasons.push(`has ${label}`);
    }
  }
  if (shellHits >= 3) {
    score += 3;
    reasons.push("strong shell coverage");
  }

  // Style / light-dark (secondary).
  for (const token of style.split(/[^a-z0-9]+/).filter((t) => t.length > 3)) {
    if (blob.includes(token)) {
      score += 1;
      reasons.push(`style “${token}”`);
    }
  }
  if (/dark/.test(color) && /dark|black|zinc-9|neutral-9|#0/i.test(blob)) {
    score += 2;
    reasons.push("dark-ready");
  }
  if (/light|bright|clean/.test(color) && /white|light|zinc-50|neutral-50|#f/i.test(blob)) {
    score += 1;
    reasons.push("light-ready");
  }

  // Industry keywords are a weak bonus only — demo business may differ.
  for (const token of purpose.split(/[^a-z0-9]+/).filter((t) => t.length > 4).slice(0, 4)) {
    if (blob.includes(token)) {
      score += 0.5;
      reasons.push(`optional niche “${token}”`);
    }
  }

  if (/purple|indigo gradient|glassmorphism|lorem ipsum/i.test(blob)) score -= 1;
  if ((artifact.dependencies || []).length > 12) {
    score -= 1;
    reasons.push("heavy deps");
  }
  if ((artifact.dependencies || []).length > 0 && (artifact.dependencies || []).length <= 6) {
    score += 1;
  }

  return {
    score,
    reason: reasons.slice(0, 5).join("; ") || `Closest usable template for “${query}”`,
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
          ? `/**\n * 21st.dev template source — adapt; do not ship demo content verbatim.\n * sourceType: 21st_template\n * sourceId: ${artifact.id || hit?.id || ""}\n * name: ${artifact.name || hit?.name || ""}\n */\n`
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
        `sourceType: 21st_template`,
        "",
        "This directory is the **required visual foundation** for the site.",
        "Adapt into `app/` and `components/site/*`, normalize to project tokens,",
        "replace demo media/copy, then remove unused template leftovers.",
        "Do NOT invent parallel heroes/navs/footers — derive from these files.",
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
  if (!/nav|header/.test(blob)) missing.unshift("nav");
  if (!/footer/.test(blob)) missing.push("footer");
  if (!/hero/.test(blob)) missing.unshift("hero");
  return missing.slice(0, 6);
}
