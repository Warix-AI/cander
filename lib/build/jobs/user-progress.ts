/**
 * Map builder/internal progress into plain language for end users.
 * Raw events stay in build_job_events for debugging; progressNote + chat
 * activity should always go through this.
 */

const FALLBACK = "Still working on your site…";

const RULES: { re: RegExp; out: string | null }[] = [
  { re: /^\$|^\s*npm\b|^\s*npx\b|^\s*node\b|^\s*pkill\b|^\s*cat\b|^\s*tail\b|^\s*ps\b/i, out: null },
  { re: /\bcoder:\s*\d+\s*tool/i, out: null },
  { re: /\b21st\.dev\b|searching 21st|search_components|get_component/i, out: "Gathering design ideas…" },
  { re: /studying\s+\d+\s+reference|inspiration/i, out: "Looking at sites you liked…" },
  { re: /researching the market|research agent/i, out: "Learning about your industry…" },
  { re: /waiting for the (dev|preview) server/i, out: "Getting your workspace ready…" },
  { re: /preparing your workspace/i, out: "Getting your workspace ready…" },
  { re: /planning your (site|app)|reading your answers|site plan ready|build packet/i, out: "Planning your pages…" },
  { re: /writing page copy|writing copy/i, out: "Writing your copy…" },
  { re: /designing the visual|design agent|design system/i, out: "Picking colors and fonts…" },
  { re: /picking components|section ideas/i, out: "Gathering design ideas…" },
  { re: /install(ing)? depend|npm install|running typescript|typecheck|\btsc\b/i, out: "Checking everything works…" },
  { re: /scaffold|next\.js|tsconfig|postcss|tailwind/i, out: "Setting up your site…" },
  { re: /building (pages|global layout)|making (the )?pages|drafting your/i, out: "Building your pages…" },
  { re: /creating the (home|about|services|pricing|faq|contact|blog|team|work)/i, out: "Building your pages…" },
  { re: /writing the home page|home page with hero/i, out: "Building your home page…" },
  { re: /header|footer|navigation|mobile nav/i, out: "Building your menu and footer…" },
  { re: /robots|sitemap|opengraph|twitter image|structured data|metadata|not-found/i, out: "Finishing site details…" },
  { re: /imagery|download(ed)?.*image|photos?/i, out: "Adding photos…" },
  { re: /preview check|check_preview|checking your pages|verifying/i, out: "Checking your pages…" },
  { re: /fixing verification|repair/i, out: "Fixing a few issues…" },
  { re: /saving your (draft|change)|draft ready|preview ready/i, out: "Almost ready…" },
  { re: /updating your site|working on your change/i, out: "Updating your site…" },
  { re: /waiting for the current change/i, out: "Waiting for the current change to finish…" },
  { re: /something took too long|build failed|could not/i, out: "Something went wrong — you can Retry." },
  { re: /testing the site in a browser|checking the change in a browser|playwright|functional/i, out: "Double-checking the site…" },
];

/**
 * Returns a short user-facing line, or null when the message should be hidden
 * (tool noise). Callers may keep the previous visible line when null.
 */
export function sanitizeUserProgress(raw: string | null | undefined): string | null {
  const msg = String(raw ?? "").trim();
  if (!msg) return null;
  for (const { re, out } of RULES) {
    if (re.test(msg)) return out;
  }
  // Strip leftover jargon tokens if somehow present.
  let cleaned = msg
    .replace(/\b(21st\.dev|next\.js|typescript|vercel|github|supabase|npm|npx|tsc)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!cleaned || cleaned.length < 3) return FALLBACK;
  // Cap length for chat thinking line.
  if (cleaned.length > 90) cleaned = `${cleaned.slice(0, 87)}…`;
  // Prefer sentence case ending with …
  if (!/[.!?…]$/.test(cleaned)) cleaned = `${cleaned.replace(/\.+$/, "")}…`;
  return cleaned;
}

/** Always returns a displayable string (never null). */
export function userProgressOrFallback(
  raw: string | null | undefined,
  fallback = FALLBACK,
): string {
  return sanitizeUserProgress(raw) ?? fallback;
}
