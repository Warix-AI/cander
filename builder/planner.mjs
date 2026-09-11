// Planning phase (create mode): turn the 8-question brief into a build packet.
//
//   master plan  ──►  ┌ copy agent        (every page's final copy)
//                     ├ design agent      (tokens, type, component style guide)
//                     ├ component agent   (21st.dev shortlist per section)
//                     └ research agent    (web_search — only when enabled)
//                                 │
//                                 ▼
//                          build packet (markdown) → coder

import { formatBrief, formatProjectSpec } from "./prompts.mjs";
import {
  runTemplateAgent,
  inferMissingComponentPurposes,
} from "./template-agent.mjs";
import { writeUiManifest } from "./ui-source.mjs";

const PLANNER_INSTRUCTIONS = `You are Cander's website planner. A 21st.dev TEMPLATE is the REQUIRED visual foundation — you do NOT invent the visual design from scratch. Native/custom visual UI is forbidden for websites.

Your job: turn the onboarding/design brief into a concrete adaptation plan for that template (content, routes, SEO, forms, missing sections).

Output Markdown with these sections, terse and specific:
## Business
One paragraph: what they do, who for, the single most important conversion.
## Brand
Name/wordmark treatment, 3–5 color tokens as hex (primary, accent, background, foreground, muted) derived from the brief, type pairing, radius, mood in 5 adjectives. Prefer adapting the template's tokens rather than inventing a new system.
## Sitemap
Table: route | page title | purpose | primary CTA. Always include /, and a contact route unless forbidden.
## Template adaptation
What to KEEP from the template (shell, rhythm, hierarchy), REMOVE (demo sections), MODIFY (copy, CTAs, imagery), and CONTENT PLAN per major section. Demo industry of the template may differ — still adapt it.
## Missing sections
List any sections the business needs that the selected template lacks (FAQ, team, gallery, pricing…). Format each needed 21st search as: \`search: <query>\` (max 6). Missing visual UI MUST come from 21st components — never invent heroes/navs/footers/cards/pricing/FAQ.
## Copy direction
Tone, vocabulary to use/avoid, 3 hero headline options, tagline.
## SEO
Title template, meta description per page, canonical = SITE_URL + route, OG concept, JSON-LD fields using SITE_URL.

When a project spec is provided it is authoritative. Fill only the gaps left to you.
No code. No placeholders — invent realistic, specific details when the brief is thin, and mark them "(assumed)".`;

const APP_PLANNER_INSTRUCTIONS = `You are Cander's product planner. Turn a short product request into a concrete, opinionated app plan a senior full-stack engineer will implement in one pass (Next.js App Router + Tailwind + Supabase when persistence/auth is needed).

Output Markdown with these sections, terse and specific:
## Product
One paragraph: what the app does, who uses it, the core job-to-be-done, the single most important flow.
## Data model
Table: entity | fields (name:type) | relations | owner (user/workspace/public). Keep it minimal but complete for the core flow. Note whether the app needs auth (yes/no) and persistence (Supabase / in-memory demo data).
## Sitemap
Table: route | screen title | purpose | primary action. Always include / (landing or dashboard), a not-found page, and the auth routes (/login, /signup) when auth is needed. Use route groups like (app) for authenticated screens.
## Screen blueprints
For EACH route: ordered list of UI regions (nav/sidebar, header, primary content, empty state, loading state, error state) with 1–2 lines each. Name the components to build.
## Brand
Product name treatment, 3–5 color tokens as hex (primary, accent, background, foreground, muted), type pairing (system stacks or a <link> to Google Fonts), radius, mood in 5 adjectives.
## Components
Shared components (AppShell, Sidebar, TopBar, DataTable, EmptyState, forms…). Then a line per 21st.dev search worth running, formatted exactly: \`search: <query>\` (max 6).
## Scaffolding
Environment variables the app reads (each must be documented in .env.example), the Supabase client files to create (lib/supabase/client.ts, lib/supabase/server.ts) and the SQL schema (supabase/schema.sql) if persistence is needed, and how the app behaves when env vars are missing (seeded demo data, never a crash).

No code beyond SQL/table sketches. No placeholders — invent realistic, specific details when the request is thin, and mark them "(assumed)".`;

const COPY_INSTRUCTIONS = `You are a senior conversion copywriter. Given a site plan, write the FINAL copy for every route in the sitemap — every section, every heading, every button label, every testimonial (with realistic names + roles), every FAQ question and answer, footer text, and form labels. Specific to this business; no lorem ipsum, no brackets, no "[insert]". Keep hero headlines under 10 words. Output Markdown: \`## <route>\` then \`### <Section name>\` blocks with the copy. Also include a \`## Global\` section with nav labels, header CTA, footer columns, legal line.`;

const APP_COPY_INSTRUCTIONS = `You are a senior product writer. Given an app plan, write the FINAL UI text for every screen in the sitemap — page titles, section headings, button labels, form labels + helper text + validation messages, empty-state and error-state copy, onboarding hints, and the landing page copy (hero, 3 value props, CTA). Specific to this product; no lorem ipsum, no brackets, no "[insert]". Output Markdown: \`## <route>\` then \`### <Region>\` blocks. Include a \`## Global\` section with nav labels, app name treatment, footer/legal line.`;

const DESIGN_INSTRUCTIONS = `You are a senior product designer who writes Tailwind v4 CSS. Given a site plan, output:
1. A \`\`\`css block for app/globals.css that starts with \`@import "tailwindcss";\`, defines :root CSS variables (brand palette from the plan as hex, --background, --foreground, --muted, --muted-foreground, --border, --primary, --primary-foreground, --accent, --accent-foreground, --radius), an \`@theme inline { ... }\` block mapping them to --color-* / --radius-* tokens, a font setup (CSS font-family stacks matching the plan; if a Google Font is chosen, note the <link> href for layout.tsx), base body styles, focus-visible ring, and 3–4 small utility classes (.container-x, .eyebrow, .prose-balanced, .section-y).
2. A short Markdown style guide: spacing rhythm (section paddings), heading scale (which Tailwind classes for h1/h2/h3/lead), button variants (primary/secondary/ghost classes), card treatment, image treatment (aspect ratios, rounding, overlays), motion rules (framer-motion: fade-up on scroll, 0.4s, once), and the dark/light decision.
No placeholder colors — pick real values.`;

const INSPIRATION_INSTRUCTIONS = `You are a senior web designer analysing a reference site the client likes. From the extracted structure below, describe in ≤90 words what to LEARN from it — page structure and section order, visual hierarchy, density/whitespace, navigation pattern, component style (cards, buttons, imagery treatment), CTA placement, and tone. Never quote its copy, brand names or suggest reusing its assets. Output one plain paragraph.`;

const RESEARCH_INSTRUCTIONS = `You are a market researcher for a web agency. Using web search, gather what a best-in-class website in this exact niche does today: 4–6 competitor or exemplar sites (name + URL + what they do well), typical page structure, trust signals customers expect (certifications, guarantees, reviews), pricing presentation norms, and 5 industry-specific phrases/terms to use. Output terse Markdown (max ~500 words). Cite URLs inline.`;

/**
 * @param {{ llm: import("./llm.mjs").LlmClient, log: import("./events.mjs").EventLog, model: string, projectKind?: "site"|"app", projectName?: string, siteUrl?: string|null, brief: Record<string, unknown>|null, projectSpec?: Record<string, unknown>|null, instruction?: string|null, twentyFirst?: import("./twenty-first.mjs").TwentyFirstClient|null, webSearch?: boolean, deadlineMs: number, repoDir?: string|null, fetchComponents?: boolean, templateFirst?: boolean, allowNativeSiteUi?: boolean }} opts
 * @returns {Promise<{ markdown: string, routes: string[], selectedComponents: Array<Record<string, unknown>>, selectedTemplate: Record<string, unknown>|null, designSystem: Record<string, unknown>|null, designDirection: string, stats: Record<string, unknown>, abort?: boolean, abortReason?: string }|null>}
 */
export async function runPlanningPhase(opts) {
  if (Date.now() > opts.deadlineMs - 5 * 60_000) return null;
  const isApp = opts.projectKind === "app";
  const templateFirst = !isApp && opts.templateFirst !== false && opts.fetchComponents !== false;
  const allowNativeSiteUi = Boolean(opts.allowNativeSiteUi);
  opts.log.emit("status", isApp ? "Planning your app" : "Planning your site", { model: opts.model });
  opts.log.emit(
    "progress",
    isApp
      ? "Understanding your product…"
      : "Understanding your website…",
    { phase: "planning" },
  );

  // ---- website: pick a 21st TEMPLATE before inventing layout ----------------
  let templateResult = null;
  if (templateFirst) {
    if (!opts.twentyFirst && !allowNativeSiteUi) {
      opts.log.emit("progress", "Design resources are temporarily unavailable…", {
        phase: "twenty_first_template",
      });
      return {
        markdown: "",
        routes: [],
        selectedComponents: [],
        selectedTemplate: null,
        designSystem: {
          source: "21st",
          fallbackReason: "twenty_first_unavailable",
          updatedAt: new Date().toISOString(),
        },
        designDirection: "",
        stats: { templateUsed: false, nativeUiUsed: false },
        abort: true,
        abortReason: "ui_source_unavailable",
      };
    }
    if (opts.twentyFirst) {
      templateResult = await runTemplateAgent({
        twentyFirst: opts.twentyFirst,
        log: opts.log,
        projectSpec: opts.projectSpec,
        projectName: opts.projectName,
        deadlineMs: opts.deadlineMs,
        repoDir: opts.repoDir,
        allowNativeSiteUi,
      });
    }
    if (templateResult?.abort && !allowNativeSiteUi) {
      return {
        markdown: "",
        routes: [],
        selectedComponents: [],
        selectedTemplate: null,
        designSystem: templateResult.designSystem,
        designDirection: "",
        stats: templateResult.stats || {},
        abort: true,
        abortReason: templateResult.abortReason || "ui_source_unavailable",
      };
    }
  }

  const briefText = opts.projectSpec
    ? formatProjectSpec(opts.projectSpec)
    : opts.brief
      ? formatBrief(opts.brief)
      : "(none provided)";
  const templateContext =
    templateResult?.selected
      ? `\n\nSelected 21st template (REQUIRED visual foundation — do NOT invent UI):\n${JSON.stringify(
          {
            id: templateResult.selected.componentId,
            name: templateResult.selected.name,
            root: templateResult.selected.localPath,
            files: templateResult.selected.files,
            reason: templateResult.selected.reason,
          },
          null,
          2,
        )}`
      : allowNativeSiteUi && templateResult?.fallbackReason
        ? `\n\n(DEV OVERRIDE allowNativeSiteUi — template unavailable: ${templateResult.fallbackReason})`
        : "";

  const input = [
    `Project name: ${opts.projectName || "Untitled"}`,
    opts.siteUrl ? `SITE_URL: ${opts.siteUrl}` : "",
    isApp ? "" : `${opts.projectSpec ? "Project spec (durable memory)" : "Onboarding brief"}:\n${briefText}${templateContext}`,
    opts.instruction
      ? `${isApp ? "Product request from the user" : "Extra instruction from the user"}:\n${opts.instruction}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const plan = await opts.llm.text({
    model: opts.model,
    instructions: isApp ? APP_PLANNER_INSTRUCTIONS : PLANNER_INSTRUCTIONS,
    input,
    maxOutputTokens: 6000,
  });
  if (!plan?.trim()) return null;
  opts.log.emit("plan", isApp ? "App plan ready" : "Site plan ready", { markdown: plan.slice(0, 12_000) });

  const routes = uniq([...plan.matchAll(/\|\s*(\/[a-z0-9\-\/]*)\s*\|/gi)].map((m) => m[1]));
  if (routes.length) {
    opts.log.emit("progress", routes.length ? `Planning ${routes.length} pages…` : "Planning your pages…");
  }

  // Prefer gap-fill component searches when a template is installed.
  if (templateResult?.selected && opts.projectSpec) {
    const blob = [
      ...(templateResult.selected.files || []),
      templateResult.markdown || "",
    ].join("\n");
    const missing = inferMissingComponentPurposes(opts.projectSpec, blob);
    if (missing.length) {
      opts._missingPurposes = missing;
      opts.log.emit("progress", "Adding the sections you need…", {
        phase: "twenty_first",
        detail: missing.join(", "),
      });
    }
  }

  // ---- fan-out --------------------------------------------------------------
  opts.log.emit("progress", templateResult?.selected ? "Applying your brand…" : "Writing your copy…");
  const planContext = isApp
    ? `Project: ${opts.projectName || "Untitled"}\n\nRequest:\n${opts.instruction || "(none)"}\n\nApp plan:\n${plan}`
    : `Project: ${opts.projectName || "Untitled"}\n\nBrief:\n${briefText}\n\nSite plan:\n${plan}${templateContext}`;

  const tasks = [
    subAgent(opts, "copy", isApp ? "Writing your screens" : "Writing your copy", {
      instructions: isApp ? APP_COPY_INSTRUCTIONS : COPY_INSTRUCTIONS,
      input: planContext,
      maxOutputTokens: 12_000,
    }),
    subAgent(opts, "design", "Picking colors and fonts", {
      instructions: DESIGN_INSTRUCTIONS,
      input: planContext,
      maxOutputTokens: 5000,
    }),
    componentAgent(opts, plan),
    inspirationAgent(opts),
    opts.webSearch && !isApp && opts.fetchComponents === false
      ? subAgent(opts, "research", "Learning about your industry", {
          instructions: RESEARCH_INSTRUCTIONS,
          input: `Project: ${opts.projectName || "Untitled"}\n\nBrief:\n${briefText}`,
          maxOutputTokens: 2500,
          tools: [{ type: "web_search" }],
        })
      : Promise.resolve(null),
  ];
  const [copy, design, componentsResult, inspiration, research] = await Promise.all(tasks);
  const componentsMarkdown =
    componentsResult && typeof componentsResult === "object"
      ? componentsResult.markdown
      : typeof componentsResult === "string"
        ? componentsResult
        : null;
  const selectedComponents =
    componentsResult && typeof componentsResult === "object" && Array.isArray(componentsResult.selected)
      ? componentsResult.selected
      : [];
  const componentStats =
    componentsResult && typeof componentsResult === "object" && componentsResult.stats
      ? componentsResult.stats
      : { searches: 0, fetches: 0, selected: 0 };

  const templateBlock = templateResult?.selected
    ? [
        "## Selected 21st TEMPLATE (REQUIRED visual foundation — adapt; NEVER invent parallel UI)",
        "```json",
        JSON.stringify({ template: templateResult.selected, designSystem: templateResult.designSystem }, null, 2),
        "```",
        templateResult.markdown || "",
        "Coder rules: adapt files under components/twenty-first/template/ into app/ + components/site/*. Preserve template visual language. Replace demo content. Visual UI must originate from this template, approved 21st components, or derivations that keep provenance. Read .cander/ui-manifest.json.",
      ].join("\n")
    : allowNativeSiteUi && templateResult?.fallbackReason
      ? `## Template unavailable (DEV native override)\nReason: ${templateResult.fallbackReason}.`
      : "";

  const selectedBlock =
    selectedComponents.length > 0
      ? [
          "## Selected components (REQUIRED for gaps — adapt and RENDER these)",
          "```json",
          JSON.stringify(
            {
              selectedComponents: selectedComponents.map((c) => ({
                source: c.source || "21st",
                sourceType: "21st_component",
                componentId: c.componentId,
                name: c.name,
                purpose: c.purpose,
                reason: c.reason,
                localPath: c.localPath,
                adaptationInstructions: c.adaptationInstructions,
              })),
            },
            null,
            2,
          ),
          "```",
          "Each localPath already contains retrieved source under components/twenty-first/. Rewrite into components/site using THIS project's / template tokens. Import and render them. Leaving them unused FAILS acceptance.",
        ].join("\n")
      : "";

  if (templateResult?.selected || selectedComponents.length) {
    writeUiManifest(opts.repoDir, {
      template: templateResult?.selected
        ? {
            id: templateResult.selected.componentId,
            name: templateResult.selected.name,
            files: templateResult.selected.files,
            root: templateResult.selected.localPath,
            reason: templateResult.selected.reason,
          }
        : undefined,
      approvedComponents: selectedComponents.map((c) => ({
        id: c.componentId,
        purpose: c.purpose,
        path: c.localPath,
        name: c.name,
        sourceType: "21st_component",
      })),
      rules: {
        noNativeVisualUi: !allowNativeSiteUi,
        deriveBeforeSearch: true,
        preserveTemplateDesign: true,
      },
    });
  }

  const packet = [
    "# Build packet",
    isApp ? "## App plan" : "## Site plan",
    plan,
    templateBlock,
    inspiration ? `## Inspiration (structure only — never copy content)\n${inspiration}` : "",
    research ? `## Market research\n${research}` : "",
    design ? `## Design system (implement exactly; adjust only for correctness)\n${design}` : "",
    copy ? `## Final copy (use verbatim; do not invent different copy)\n${copy}` : "",
    selectedBlock || (componentsMarkdown ? `## 21st.dev component shortlist\n${componentsMarkdown}` : ""),
    !isApp
      ? "## UI source rule (HARD)\nMeaningful visual UI must come from the selected template, approved 21st components, or derived project components. Glue/wiring is fine. Inventing heroes/navs/footers/cards/sections fails acceptance."
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const stats = {
    ...componentStats,
    templateSearches: Number(templateResult?.stats?.searches || 0),
    templateFetches: Number(templateResult?.stats?.fetches || 0),
    templateSelected: Number(templateResult?.stats?.selected || 0),
    templateUsed: Boolean(templateResult?.stats?.templateUsed),
    templateFetched: Boolean(templateResult?.stats?.templateFetched),
    templateInstalled: Boolean(templateResult?.stats?.templateInstalled),
    templateRendered: Boolean(templateResult?.stats?.templateRendered),
    nativeUiUsed: Boolean(templateResult?.stats?.nativeUiUsed),
    templateFallback: templateResult?.fallbackReason || null,
  };

  opts.log.emit("plan", "Build packet ready", {
    chars: packet.length,
    parts: {
      copy: Boolean(copy),
      design: Boolean(design),
      components: Boolean(componentsMarkdown || selectedComponents.length),
      template: Boolean(templateResult?.selected),
      research: Boolean(research),
      selected: selectedComponents.length,
    },
    stats,
  });
  return {
    markdown: truncateMiddle(packet, 90_000),
    routes,
    selectedComponents,
    selectedTemplate: templateResult?.selected || null,
    designSystem: templateResult?.designSystem || null,
    designDirection: String(design || "").slice(0, 4000),
    stats,
  };
}

async function subAgent(opts, name, progress, call) {
  if (Date.now() > opts.deadlineMs - 3 * 60_000) return null;
  opts.log.emit("progress", `${progress}…`);
  try {
    const out = await opts.llm.text({ model: opts.model, ...call });
    opts.log.emit("plan", `${name} agent done`, { name, chars: out?.length ?? 0 });
    return out?.trim() || null;
  } catch (err) {
    opts.log.emit("log", `${name} agent failed: ${err?.message || err}`);
    return null;
  }
}

/**
 * Inspiration research: fetch the sites the user pointed at, reduce them to
 * structure (headings, nav, sections, buttons), summarise what to learn, and
 * record the summaries in the project spec via a spec_update event.
 */
async function inspirationAgent(opts) {
  const urls = Array.isArray(opts.projectSpec?.inspiration)
    ? opts.projectSpec.inspiration
        .filter((i) => i && typeof i.url === "string" && !(i.summary && i.summary.trim()))
        .map((i) => i.url)
        .slice(0, 3)
    : [];
  if (!urls.length) return null;
  opts.log.emit("progress", "Looking at sites you liked…");
  const results = [];
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(15_000),
        headers: { "user-agent": "Mozilla/5.0 (compatible; CanderBuilder/1.0)", accept: "text/html" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = (await res.text()).slice(0, 600_000);
      const structure = extractStructure(html);
      const summary = await opts.llm.text({
        model: opts.model,
        instructions: INSPIRATION_INSTRUCTIONS,
        input: `URL: ${url}\n\n${structure}`,
        maxOutputTokens: 400,
      });
      if (summary?.trim()) results.push({ url, summary: summary.trim() });
    } catch (err) {
      opts.log.emit("log", `inspiration: ${url} skipped (${err?.message || err})`);
    }
  }
  if (!results.length) return null;
  const existing = Array.isArray(opts.projectSpec?.inspiration) ? opts.projectSpec.inspiration : [];
  const merged = existing.map((i) => results.find((r) => r.url === i.url) || i);
  for (const r of results) if (!merged.some((m) => m.url === r.url)) merged.push(r);
  opts.log.emit("spec_update", "Recorded inspiration research", {
    patch: { inspiration: merged },
    decision: `Studied ${results.length} reference site(s) for structure and hierarchy.`,
  });
  return results.map((r) => `- ${r.url}: ${r.summary}`).join("\n");
}

function extractStructure(html) {
  const strip = (s) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const title = strip(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  const headings = [...html.matchAll(/<(h[1-3])[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((m) => `${m[1].toUpperCase()}: ${strip(m[2]).slice(0, 80)}`)
    .slice(0, 40);
  const navLinks = [...(html.match(/<nav[\s\S]*?<\/nav>/i)?.[0] || "").matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi)]
    .map((m) => strip(m[1]).slice(0, 30))
    .filter(Boolean)
    .slice(0, 15);
  const buttons = [...html.matchAll(/<(?:button|a)[^>]*class=["'][^"']*(?:btn|button|cta)[^"']*["'][^>]*>([\s\S]*?)<\/(?:button|a)>/gi)]
    .map((m) => strip(m[1]).slice(0, 30))
    .filter(Boolean)
    .slice(0, 12);
  const sections = (html.match(/<section[\s>]/gi) || []).length;
  const images = (html.match(/<img[\s>]/gi) || []).length;
  const videos = (html.match(/<video[\s>]/gi) || []).length;
  const hasDark = /(?:^|\s)dark(?:\s|$)|prefers-color-scheme:\s*dark/i.test(html);
  return [
    `Title: ${title}`,
    `Nav links (${navLinks.length}): ${navLinks.join(" | ")}`,
    `Heading outline:\n${headings.join("\n")}`,
    `Button/CTA labels: ${buttons.join(" | ")}`,
    `Counts: sections=${sections} images=${images} videos=${videos} darkTheme=${hasDark}`,
  ].join("\n\n");
}

/**
 * Spec-driven 21st.dev research. When `fetchComponents` is on, search then
 * fetch ~2–4 promising candidates per key purpose, compare, select best,
 * and materialize under components/twenty-first/. Search alone is not enough.
 * Failures return null / empty selected; never throws. Website CREATE must already
 * have a template installed — this agent only gap-fills approved 21st components.
 *
 * @returns {Promise<null | { markdown: string, selected: Array<Record<string, unknown>>, stats: { searches: number, fetches: number, selected: number } }>}
 */
async function componentAgent(opts, plan) {
  if (!opts.twentyFirst) return null;
  const spec = opts.projectSpec || {};
  const brief = spec.designBrief || {};
  const direction = String(
    brief.styleDirection || spec.visual?.direction || "",
  ).toLowerCase();
  const mood = /technical|aerospace|engineering/.test(direction)
    ? "technical precise"
    : /dark|premium|luxury/.test(direction)
      ? "dark premium"
      : /bold/.test(direction)
        ? "bold modern"
        : /warm|friendly|playful/.test(direction)
          ? "playful colorful"
          : /editorial/.test(direction)
            ? "editorial magazine"
            : /minimal/.test(direction)
              ? "minimal clean"
              : "modern clean";
  const features = (Array.isArray(spec.features) ? spec.features : []).map((f) => String(f).toLowerCase());
  const pages = (Array.isArray(spec.pages) ? spec.pages : []).map((p) => String(p.path || "").toLowerCase());
  const layout = String(spec.visual?.layout || "").toLowerCase();
  const isApp = opts.projectKind === "app";

  /** @type {Array<{ query: string, purpose: string }>} */
  const catalog = isApp
    ? [
        { query: `${mood} app sidebar navigation`, purpose: "nav" },
        { query: `${mood} dashboard header`, purpose: "shell" },
        { query: `${mood} data table`, purpose: "table" },
        { query: `${mood} empty state`, purpose: "empty" },
        { query: `${mood} settings form`, purpose: "form" },
      ]
    : [
        { query: `${mood} navbar with mobile menu`, purpose: "nav" },
        {
          query: /split/.test(layout)
            ? `${mood} split hero with image`
            : /bleed/.test(layout)
              ? `${mood} full-width hero background image`
              : `${mood} marketing hero section`,
          purpose: "hero",
        },
        { query: `${mood} features section`, purpose: "features" },
        { query: `${mood} call to action band`, purpose: "cta" },
        { query: `${mood} site footer`, purpose: "footer" },
      ];
  if (!isApp) {
    if (features.some((f) => /testimonial/.test(f))) catalog.push({ query: `${mood} testimonials`, purpose: "testimonials" });
    if (features.some((f) => /pricing/.test(f)) || pages.includes("/pricing")) {
      catalog.push({ query: `${mood} pricing table`, purpose: "pricing" });
    }
    if (features.some((f) => /faq/.test(f))) catalog.push({ query: `${mood} faq accordion`, purpose: "faq" });
    if (features.some((f) => /contact form|booking|newsletter/.test(f))) {
      catalog.push({ query: `${mood} contact form`, purpose: "contact" });
    }
  }

  // When a template was selected, only fetch gap-fill purposes unless none inferred.
  const missingPurposes = Array.isArray(opts._missingPurposes) ? opts._missingPurposes : null;
  let baseCatalog = catalog;
  if (!isApp && missingPurposes?.length) {
    const allowed = new Set(missingPurposes);
    baseCatalog = catalog.filter((c) => allowed.has(c.purpose));
    for (const purpose of missingPurposes) {
      if (!baseCatalog.some((c) => c.purpose === purpose)) {
        baseCatalog.push({ query: `${mood} ${purpose} section`, purpose });
      }
    }
  }

  const planQueries = [...plan.matchAll(/^\s*[-*]?\s*`?search:\s*([^`\n]+)`?\s*$/gim)].map((m) => ({
    query: m[1].trim(),
    purpose: "section",
  }));
  const queries = uniqBy([...baseCatalog, ...planQueries], (x) => x.query).slice(0, opts.fetchComponents ? 8 : 10);
  if (!queries.length) return null;

  opts.log.emit("progress", "Finding design components…", { phase: "twenty_first" });
  const lines = [];
  /** @type {Array<{ purpose: string, hit: { id: string, name?: string, category?: string, description?: string } }>} */
  const candidates = [];
  let searches = 0;
  for (const q of queries) {
    if (Date.now() > opts.deadlineMs - 3 * 60_000) break;
    let hits = [];
    try {
      hits = await opts.twentyFirst.search(q.query, 4);
      searches += 1;
    } catch (err) {
      opts.log.emit("log", `21st search failed (${q.purpose}): ${err?.message || err}`);
      continue;
    }
    if (!hits.length) continue;
    lines.push(`### ${q.query}`);
    for (const h of hits) {
      lines.push(`- id=${h.id} — ${h.name}${h.category ? ` (${h.category})` : ""}`);
      candidates.push({ purpose: q.purpose, hit: h });
    }
  }
  if (!lines.length) return null;

  /** @type {Array<Record<string, unknown>>} */
  const selected = [];
  let fetches = 0;
  const fetchEnabled = opts.fetchComponents !== false;
  if (fetchEnabled) {
    opts.log.emit("progress", "Reviewing component options…", {
      phase: "twenty_first",
      detail: `Reviewing ${Math.min(candidates.length, 12)} design component options`,
    });
    /** @type {Map<string, Array<{ purpose: string, hit: any }>>} */
    const byPurpose = new Map();
    for (const c of candidates) {
      const list = byPurpose.get(c.purpose) || [];
      list.push(c);
      byPurpose.set(c.purpose, list);
    }
    // Prefer core site purposes; fetch 2–4 candidates across purposes.
    const purposeOrder = ["hero", "nav", "features", "cta", "footer", "contact", "faq", "testimonials", "pricing", "section", "shell", "table", "empty", "form"];
    const orderedPurposes = [
      ...purposeOrder.filter((p) => byPurpose.has(p)),
      ...[...byPurpose.keys()].filter((p) => !purposeOrder.includes(p)),
    ];
    /** @type {Array<{ purpose: string, hit: any }>} */
    const toFetch = [];
    for (const purpose of orderedPurposes) {
      const list = byPurpose.get(purpose) || [];
      // Take top 2 hits per purpose so we can compare.
      for (const item of list.slice(0, 2)) {
        if (toFetch.length >= 8) break;
        if (toFetch.some((t) => t.hit.id === item.hit.id)) continue;
        toFetch.push(item);
      }
      if (toFetch.length >= 8) break;
    }

    const { mkdirSync, writeFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const repoDir = opts.repoDir || null;
    /** @type {Array<{ pick: any, component: any, score: number }>} */
    const fetched = [];
    for (const pick of toFetch) {
      if (Date.now() > opts.deadlineMs - 2 * 60_000) break;
      let component = null;
      try {
        component = await opts.twentyFirst.get(pick.hit.id);
        fetches += 1;
      } catch (err) {
        opts.log.emit("log", `21st get failed (${pick.hit.id}): ${err?.message || err}`);
        continue;
      }
      if (!component?.code) continue;
      const score = scoreComponentCandidate(component, pick, mood, direction);
      fetched.push({ pick, component, score });
    }

    // Select best per purpose (and keep overall top if sparse).
    const bestByPurpose = new Map();
    for (const f of fetched.sort((a, b) => b.score - a.score)) {
      if (!bestByPurpose.has(f.pick.purpose)) bestByPurpose.set(f.pick.purpose, f);
    }
    const winners = [...bestByPurpose.values()].slice(0, 6);
    opts.log.emit("progress", `Reviewing ${fetched.length} design component options…`, {
      phase: "twenty_first",
      detail: `Selected ${winners.length} of ${fetched.length} fetched`,
    });

    for (const { pick, component, score } of winners) {
      const slug = String(pick.hit.id)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 48);
      const localPath = `components/twenty-first/${pick.purpose}-${slug || "component"}.tsx`;
      if (repoDir) {
        try {
          mkdirSync(join(repoDir, "components/twenty-first"), { recursive: true });
          const header = `/**\n * Retrieved from 21st.dev for adaptation — do not ship verbatim.\n * id=${component.id} name=${component.name || pick.hit.name || ""}\n * purpose=${pick.purpose} score=${score}\n */\n`;
          writeFileSync(join(repoDir, localPath), `${header}${component.code}\n`, "utf8");
        } catch (err) {
          opts.log.emit("log", `21st write failed: ${err?.message || err}`);
        }
      }
      selected.push({
        source: "21st",
        componentId: String(component.id || pick.hit.id),
        name: String(component.name || pick.hit.name || pick.hit.id),
        purpose: pick.purpose,
        reason: `Best of ${byPurpose.get(pick.purpose)?.length || 1} candidates for ${pick.purpose} (${mood})`,
        localPath: repoDir ? localPath : undefined,
        adaptationInstructions:
          "Normalize to THIS project's design system before use: CSS variables from app/globals.css, brand fonts, radius/shadow/spacing/container width from the design brief, project copy and imagery. Replace hard-coded colors/fonts. Fix imports to components/ui/* and lib/utils cn. Install only packages you use. Keep structure/motion ideas; drop unavailable deps. The final site must look like one designer created it — not a collage.",
      });
    }
  }

  lines.push(
    "",
    selected.length
      ? `Fetched and selected ${selected.length} component(s) into components/twenty-first/ after comparing candidates — adapt those first and actually import them into the live pages.`
      : "Adaptation rules: get_component(id) for the ones that fit, then rewrite into components/ using THIS project's tokens. Never paste a component verbatim.",
  );

  return {
    markdown: lines.join("\n"),
    selected,
    stats: { searches, fetches, selected: selected.length },
  };
}

function scoreComponentCandidate(component, pick, mood, direction) {
  const blob = `${component.name || ""} ${component.description || ""} ${pick.hit.name || ""} ${pick.hit.description || ""} ${pick.hit.category || ""}`.toLowerCase();
  let score = 1;
  if (blob.includes(pick.purpose)) score += 3;
  for (const token of String(mood).split(/\s+/)) {
    if (token.length > 2 && blob.includes(token)) score += 1;
  }
  for (const token of String(direction).split(/[^a-z0-9]+/)) {
    if (token.length > 3 && blob.includes(token)) score += 1;
  }
  const codeLen = String(component.code || "").length;
  if (codeLen > 400 && codeLen < 40_000) score += 2;
  if (/purple|indigo gradient|glassmorphism/i.test(blob)) score -= 1;
  return score;
}

function uniqBy(arr, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of arr) {
    const k = keyFn(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

function uniq(arr) {
  return [...new Set(arr)];
}

function truncateMiddle(s, max) {
  if (s.length <= max) return s;
  const head = s.slice(0, Math.floor(max * 0.75));
  const tail = s.slice(-Math.floor(max * 0.2));
  return `${head}\n\n… (packet truncated) …\n\n${tail}`;
}

