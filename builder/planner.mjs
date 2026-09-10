// Planning phase (create mode): turn the 8-question brief into a build packet.
//
//   master plan  ──►  ┌ copy agent        (every page's final copy)
//                     ├ design agent      (tokens, type, component style guide)
//                     ├ component agent   (21st.dev shortlist per section)
//                     └ research agent    (web_search — only when enabled)
//                                 │
//                                 ▼
//                          build packet (markdown) → coder

import { formatBrief } from "./prompts.mjs";

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
Title template, meta description per page (one line each), Organization/LocalBusiness JSON-LD fields.

No code. No placeholders — invent realistic, specific details when the brief is thin, and mark them "(assumed)".`;

const COPY_INSTRUCTIONS = `You are a senior conversion copywriter. Given a site plan, write the FINAL copy for every route in the sitemap — every section, every heading, every button label, every testimonial (with realistic names + roles), every FAQ question and answer, footer text, and form labels. Specific to this business; no lorem ipsum, no brackets, no "[insert]". Keep hero headlines under 10 words. Output Markdown: \`## <route>\` then \`### <Section name>\` blocks with the copy. Also include a \`## Global\` section with nav labels, header CTA, footer columns, legal line.`;

const DESIGN_INSTRUCTIONS = `You are a senior product designer who writes Tailwind v4 CSS. Given a site plan, output:
1. A \`\`\`css block for app/globals.css that starts with \`@import "tailwindcss";\`, defines :root CSS variables (brand palette from the plan as hex, --background, --foreground, --muted, --muted-foreground, --border, --primary, --primary-foreground, --accent, --accent-foreground, --radius), an \`@theme inline { ... }\` block mapping them to --color-* / --radius-* tokens, a font setup (CSS font-family stacks matching the plan; if a Google Font is chosen, note the <link> href for layout.tsx), base body styles, focus-visible ring, and 3–4 small utility classes (.container-x, .eyebrow, .prose-balanced, .section-y).
2. A short Markdown style guide: spacing rhythm (section paddings), heading scale (which Tailwind classes for h1/h2/h3/lead), button variants (primary/secondary/ghost classes), card treatment, image treatment (aspect ratios, rounding, overlays), motion rules (framer-motion: fade-up on scroll, 0.4s, once), and the dark/light decision.
No placeholder colors — pick real values.`;

const RESEARCH_INSTRUCTIONS = `You are a market researcher for a web agency. Using web search, gather what a best-in-class website in this exact niche does today: 4–6 competitor or exemplar sites (name + URL + what they do well), typical page structure, trust signals customers expect (certifications, guarantees, reviews), pricing presentation norms, and 5 industry-specific phrases/terms to use. Output terse Markdown (max ~500 words). Cite URLs inline.`;

/**
 * @param {{ llm: import("./llm.mjs").LlmClient, log: import("./events.mjs").EventLog, model: string, projectName?: string, brief: Record<string, unknown>|null, instruction?: string|null, twentyFirst?: import("./twenty-first.mjs").TwentyFirstClient|null, webSearch?: boolean, deadlineMs: number }} opts
 * @returns {Promise<{ markdown: string, routes: string[] }|null>}
 */
export async function runPlanningPhase(opts) {
  if (Date.now() > opts.deadlineMs - 5 * 60_000) return null;
  opts.log.emit("status", "Planning your site", { model: opts.model });
  opts.log.emit("progress", "Reading your answers and planning pages, sections, and brand…");

  const briefText = opts.brief ? formatBrief(opts.brief) : "(none provided)";
  const input = [
    `Project name: ${opts.projectName || "Untitled"}`,
    `Onboarding brief:\n${briefText}`,
    opts.instruction ? `Extra instruction from the user:\n${opts.instruction}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const plan = await opts.llm.text({
    model: opts.model,
    instructions: PLANNER_INSTRUCTIONS,
    input,
    maxOutputTokens: 6000,
  });
  if (!plan?.trim()) return null;
  opts.log.emit("plan", "Site plan ready", { markdown: plan.slice(0, 12_000) });

  const routes = uniq([...plan.matchAll(/\|\s*(\/[a-z0-9\-\/]*)\s*\|/gi)].map((m) => m[1]));
  if (routes.length) {
    opts.log.emit("progress", `Planned ${routes.length} page(s): ${routes.slice(0, 8).join(", ")}`);
  }

  // ---- fan-out --------------------------------------------------------------
  opts.log.emit("progress", "Writing copy, designing the system, and picking components in parallel…");
  const planContext = `Project: ${opts.projectName || "Untitled"}\n\nBrief:\n${briefText}\n\nSite plan:\n${plan}`;

  const tasks = [
    subAgent(opts, "copy", "Writing page copy", {
      instructions: COPY_INSTRUCTIONS,
      input: planContext,
      maxOutputTokens: 12_000,
    }),
    subAgent(opts, "design", "Designing the visual system", {
      instructions: DESIGN_INSTRUCTIONS,
      input: planContext,
      maxOutputTokens: 5000,
    }),
    componentAgent(opts, plan),
    opts.webSearch
      ? subAgent(opts, "research", "Researching the market", {
          instructions: RESEARCH_INSTRUCTIONS,
          input: `Project: ${opts.projectName || "Untitled"}\n\nBrief:\n${briefText}`,
          maxOutputTokens: 2500,
          tools: [{ type: "web_search" }],
        })
      : Promise.resolve(null),
  ];
  const [copy, design, components, research] = await Promise.all(tasks);

  const packet = [
    "# Build packet",
    "## Site plan",
    plan,
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
