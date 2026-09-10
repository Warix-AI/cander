// Planning phase (create mode): turn the 8-question brief into a concrete site
// plan the coder follows. Phase 1: single planner call. Phase 2 adds parallel
// research / content / design / component sub-agents.

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
Shared components to build (Header, MobileNav, Footer, Section, CTA band, Testimonial card, FAQ accordion, ContactForm…). Note which sections are good candidates for a 21st.dev component search and the search query to use.
## SEO
Title template, meta description per page (one line each), Organization/LocalBusiness JSON-LD fields.

No code. No placeholders — invent realistic, specific details when the brief is thin, and mark them "(assumed)".`;

/**
 * @param {{ llm: import("./llm.mjs").LlmClient, log: import("./events.mjs").EventLog, model: string, projectName?: string, brief: Record<string, unknown>|null, instruction?: string|null, twentyFirst?: unknown, deadlineMs: number }} opts
 * @returns {Promise<{ markdown: string }|null>}
 */
export async function runPlanningPhase(opts) {
  if (Date.now() > opts.deadlineMs - 5 * 60_000) return null;
  opts.log.emit("status", "Planning your site", { model: opts.model });
  opts.log.emit("progress", "Reading your answers and planning pages, sections, and brand…");
  const input = [
    `Project name: ${opts.projectName || "Untitled"}`,
    `Onboarding brief:\n${opts.brief ? formatBrief(opts.brief) : "(none provided)"}`,
    opts.instruction ? `Extra instruction from the user:\n${opts.instruction}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const markdown = await opts.llm.text({
    model: opts.model,
    instructions: PLANNER_INSTRUCTIONS,
    input,
    maxOutputTokens: 6000,
  });
  if (!markdown?.trim()) return null;
  opts.log.emit("plan", "Site plan ready", { markdown: markdown.slice(0, 12_000) });
  const routes = [...markdown.matchAll(/\|\s*(\/[a-z0-9\-\/]*)\s*\|/gi)].map((m) => m[1]);
  if (routes.length) {
    opts.log.emit("progress", `Planned ${new Set(routes).size} page(s): ${[...new Set(routes)].slice(0, 8).join(", ")}`);
  }
  return { markdown };
}
