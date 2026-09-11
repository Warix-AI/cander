/**
 * Map builder/internal progress into plain language for end users.
 * Raw events stay in build_job_events for debugging; progressNote + chat
 * activity should always go through this.
 */

const FALLBACK = "Still working on your site…";

const RULES: { re: RegExp; out: string | null }[] = [
  { re: /^\$|^\s*npm\b|^\s*npx\b|^\s*node\b|^\s*pkill\b|^\s*cat\b|^\s*tail\b|^\s*ps\b/i, out: null },
  { re: /\bcoder:\s*\d+\s*tool/i, out: null },
  { re: /\bchain.?of.?thought\b|\bprivate reasoning\b|\bOPENAI_API_KEY\b|\bBearer\s+[A-Za-z0-9._-]+/i, out: null },
  { re: /\bPID\s*\d+|process\s+\d+|stack trace|Error:\s*ENOENT/i, out: null },
  { re: /finding the right design|reviewing website templates|preparing your design|customizing the template/i, out: "Finding the right design…" },
  { re: /adding the sections you need/i, out: "Adding the sections you need…" },
  { re: /\b21st\.dev\b|searching 21st|search_components|get_component|design component/i, out: "Finding design components…" },
  { re: /reviewing\s+\d+\s+(design )?component|comparing component|pulling in design/i, out: "Reviewing component options…" },
  { re: /studying\s+\d+\s+reference|inspiration|reference (site|url)/i, out: "Looking at sites you liked…" },
  { re: /researching the market|research agent/i, out: "Learning about your industry…" },
  { re: /understanding your (website|site|brief)|canonical design brief|choosing a visual direction/i, out: "Understanding your website…" },
  { re: /waiting for the (dev|preview) server|preparing your workspace|sandbox/i, out: "Preparing your workspace…" },
  { re: /planning your (site|app)|reading your answers|site plan ready|build packet/i, out: "Choosing a visual direction…" },
  { re: /writing page copy|writing copy/i, out: "Writing your copy…" },
  { re: /designing the visual|design agent|design system|applying your brand|picking colors/i, out: "Applying your brand…" },
  { re: /preparing imagery|adding photos|download(ed)?.*image/i, out: "Preparing imagery…" },
  { re: /install(ing)? depend|npm install/i, out: "Setting up your site…" },
  { re: /running typescript|typecheck|\btsc\b|validating the code/i, out: "Validating the code…" },
  { re: /scaffold|next\.js|tsconfig|postcss|tailwind/i, out: "Setting up your site…" },
  { re: /building (the )?home|writing the home page|home page with hero/i, out: "Building the homepage…" },
  { re: /building (pages|global layout)|making (the )?pages|drafting your|building your pages|building the remaining/i, out: "Building your pages…" },
  { re: /adding interactions|framer|animation/i, out: "Adding interactions…" },
  { re: /header|footer|navigation|mobile nav/i, out: "Building your menu and footer…" },
  { re: /robots|sitemap|opengraph|twitter image|structured data|metadata|not-found/i, out: "Finishing site details…" },
  { re: /preparing preview|preview recovery|preview unreachable|preview server unavailable|preview (server )?(restart|recover)|starting the preview|starting your preview/i, out: "Starting your preview…" },
  { re: /checking the previous draft|picking up where/i, out: "Picking up where I left off…" },
  { re: /found something that needs|fixing (a )?(layout|build|visual)|repairing build|running verification|repair/i, out: "Fixing a layout issue…" },
  { re: /rechecking|checking the change again/i, out: "Rechecking the changes…" },
  { re: /checking (the )?homepage|checking about|checking contact|checking your pages|preview check|check_preview|verifying|verification|testing navigation/i, out: "Checking your pages…" },
  { re: /checking mobile|mobile layout/i, out: "Checking mobile layout…" },
  { re: /checking images|image check|broken image/i, out: "Checking images…" },
  { re: /visual (qa|review)|reviewing layout|polishing the design|screenshot/i, out: "Polishing the design…" },
  { re: /page performance|lighthouse/i, out: "Checking page performance…" },
  { re: /still validating|finishing production|checking generated pages/i, out: "Running final build checks…" },
  { re: /preparing production|running final build|next build|production (build|check|validation)/i, out: "Preparing production build…" },
  { re: /saving your (draft|change|project)|draft ready|persisting/i, out: "Saving your project…" },
  { re: /preparing your (preview|live)|publishing|almost ready|preview ready|ready to review/i, out: "Almost ready…" },
  { re: /updating your site|working on your change/i, out: "Updating your site…" },
  { re: /waiting for the current change/i, out: "Waiting for the current change to finish…" },
  { re: /something took too long|build failed|could not|hit a problem on our side|didn.t pass all of my checks|hit a snag/i, out: "Something went wrong — you can Retry." },
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
  let cleaned = msg
    .replace(/\b(21st\.dev|next\.js|typescript|vercel|github|supabase|npm|npx|tsc|playwright)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!cleaned || cleaned.length < 3) return FALLBACK;
  if (cleaned.length > 90) cleaned = `${cleaned.slice(0, 87)}…`;
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

/**
 * Throttle helper for tests / runner: keep a more specific note over a generic heartbeat.
 */
export function preferInformativeProgress(
  previous: string | null | undefined,
  next: string | null | undefined,
  opts?: { nextIsHeartbeat?: boolean },
): string {
  const prev = (previous || "").trim();
  const n = (next || "").trim();
  if (!n) return prev || FALLBACK;
  if (!prev) return n;
  if (opts?.nextIsHeartbeat) {
    // Don't let a vague heartbeat wipe a concrete status.
    const vague = /still |almost ready|working on your/i.test(n);
    const concrete = /building|checking|finding|preparing|fixing|saving|reviewing/i.test(prev);
    if (vague && concrete) return prev;
  }
  return n;
}
