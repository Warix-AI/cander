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

const PLANNER_INSTRUCTIONS = `You are Cander's website planner. Turn a short onboarding brief into a concrete, opinionated site plan a senior front-end engineer will implement in one pass (Next.js App Router + Tailwind).

Output Markdown with these sections, terse and specific:
## Business
One paragraph: what they do, who for, the single most important conversion.
## Brand
Name/wordmark treatment, 3–5 color tokens as hex (primary, accent, background, foreground, muted) derived from the brief, type pairing (display + body, available via system stacks or a <link> to Google Fonts), radius, overall mood in 5 adjectives.
## Sitemap
Table: route | page title | purpose | primary CTA. Include every page the brief's depth implies. Always include /, and a contact route unless the brief forbids it.
## Page blueprints
For EACH route: ordered list of sections with 1–2 lines describing content, layout, and imagery (Unsplash subject suggestions). Vary section layouts across the site.
## Copy direction
Tone, vocabulary to use/avoid, 3 headline options for the hero, tagline.
## Components
Shared components to build (Header, MobileNav, Footer, Section, CTA band, Testimonial card, FAQ accordion, ContactForm…). Then a line per 21st.dev search worth running, formatted exactly: \`search: <query>\` (max 6).
## SEO
Title template, meta description per page (one line each), canonical = SITE_URL + route, OG image concept (headline + brand colors for the generated 1200×630 image), Organization/LocalBusiness JSON-LD fields using SITE_URL.

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
 * @param {{ llm: import("./llm.mjs").LlmClient, log: import("./events.mjs").EventLog, model: string, projectKind?: "site"|"app", projectName?: string, siteUrl?: string|null, brief: Record<string, unknown>|null, projectSpec?: Record<string, unknown>|null, instruction?: string|null, twentyFirst?: import("./twenty-first.mjs").TwentyFirstClient|null, webSearch?: boolean, deadlineMs: number }} opts
 * @returns {Promise<{ markdown: string, routes: string[] }|null>}
 */
export async function runPlanningPhase(opts) {
  if (Date.now() > opts.deadlineMs - 5 * 60_000) return null;
  const isApp = opts.projectKind === "app";
  opts.log.emit("status", isApp ? "Planning your app" : "Planning your site", { model: opts.model });
  opts.log.emit(
    "progress",
    isApp
      ? "Reading your request and planning screens, data model, and brand…"
      : "Reading your answers and planning pages, sections, and brand…",
  );

  const briefText = opts.projectSpec
    ? formatProjectSpec(opts.projectSpec)
    : opts.brief
      ? formatBrief(opts.brief)
      : "(none provided)";
  const input = [
    `Project name: ${opts.projectName || "Untitled"}`,
    opts.siteUrl ? `SITE_URL: ${opts.siteUrl}` : "",
    isApp ? "" : `${opts.projectSpec ? "Project spec (durable memory)" : "Onboarding brief"}:\n${briefText}`,
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
    opts.log.emit("progress", `Planned ${routes.length} page(s): ${routes.slice(0, 8).join(", ")}`);
  }

  // ---- fan-out --------------------------------------------------------------
  opts.log.emit("progress", "Writing copy, designing the system, and picking components in parallel…");
  const planContext = isApp
    ? `Project: ${opts.projectName || "Untitled"}\n\nRequest:\n${opts.instruction || "(none)"}\n\nApp plan:\n${plan}`
    : `Project: ${opts.projectName || "Untitled"}\n\nBrief:\n${briefText}\n\nSite plan:\n${plan}`;

  const tasks = [
    subAgent(opts, "copy", isApp ? "Writing UI text" : "Writing page copy", {
      instructions: isApp ? APP_COPY_INSTRUCTIONS : COPY_INSTRUCTIONS,
      input: planContext,
      maxOutputTokens: 12_000,
    }),
    subAgent(opts, "design", "Designing the visual system", {
      instructions: DESIGN_INSTRUCTIONS,
      input: planContext,
      maxOutputTokens: 5000,
    }),
    componentAgent(opts, plan),
    inspirationAgent(opts),
    opts.webSearch && !isApp
      ? subAgent(opts, "research", "Researching the market", {
          instructions: RESEARCH_INSTRUCTIONS,
          input: `Project: ${opts.projectName || "Untitled"}\n\nBrief:\n${briefText}`,
          maxOutputTokens: 2500,
          tools: [{ type: "web_search" }],
        })
      : Promise.resolve(null),
  ];
  const [copy, design, components, inspiration, research] = await Promise.all(tasks);

  const packet = [
    "# Build packet",
    isApp ? "## App plan" : "## Site plan",
    plan,
    inspiration ? `## Inspiration (structure only — never copy content)\n${inspiration}` : "",
    research ? `## Market research\n${research}` : "",
    design ? `## Design system (implement exactly; adjust only for correctness)\n${design}` : "",
    copy ? `## Final copy (use verbatim; do not invent different copy)\n${copy}` : "",
    components ? `## 21st.dev component shortlist\n${components}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  opts.log.emit("plan", "Build packet ready", {
    chars: packet.length,
    parts: { copy: Boolean(copy), design: Boolean(design), components: Boolean(components), research: Boolean(research) },
  });
  return { markdown: truncateMiddle(packet, 90_000), routes };
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
  opts.log.emit("progress", `Studying ${urls.length} reference site(s)…`);
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

async function componentAgent(opts, plan) {
  if (!opts.twentyFirst) return null;
  const queries = uniq(
    [...plan.matchAll(/^\s*[-*]?\s*`?search:\s*([^`\n]+)`?\s*$/gim)].map((m) => m[1].trim()),
  ).slice(0, 6);
  if (!queries.length) return null;
  opts.log.emit("progress", `Searching 21st.dev for ${queries.length} section ideas…`);
  const lines = [];
  for (const q of queries) {
    const hits = await opts.twentyFirst.search(q, 3);
    if (!hits.length) continue;
    lines.push(`### ${q}`);
    for (const h of hits) {
      lines.push(`- id=${h.id} — ${h.name}${h.category ? ` (${h.category})` : ""}`);
    }
  }
  if (!lines.length) return null;
  lines.push(
    "",
    "Use get_component(id) to pull source for the ones that fit; adapt into components/ (fix imports, tokens, copy). Skip anything that needs unavailable packages.",
  );
  return lines.join("\n");
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
