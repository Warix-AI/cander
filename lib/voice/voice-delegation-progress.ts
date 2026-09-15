/**
 * Spoken mid-delegation progress for GPT-Live.
 * Uses session.commentary.append so the Live model paraphrases updates aloud
 * instead of leaving long silent gaps while Candor runs tools.
 */

export type VoiceProgressLike = {
  phase?: string;
  label?: string;
  detail?: string;
  toolName?: string;
};

export type VoiceProgressSpeakOpts = {
  /** Force speak even if throttle / duplicate would skip. */
  force?: boolean;
};

export type VoiceDelegationNarrator = {
  /** Immediate ack when delegation starts. */
  open: (ctx: VoiceDelegationOpenContext) => void;
  /** Map orchestrator progress → short spoken update. */
  fromProgress: (progress: VoiceProgressLike) => void;
  /** Speak an arbitrary short line (preflight, scoped connector, etc.). */
  say: (line: string, opts?: VoiceProgressSpeakOpts) => void;
  /** Stop heartbeats; call before final answer commentary. */
  finish: () => void;
};

export type VoiceDelegationOpenContext = {
  requestText: string;
  connectorId?: string | null;
  focusedTitle?: string | null;
  needsBrowser?: boolean;
};

const MIN_INTERVAL_MS = 6_500;
/** Only speak a silence heartbeat after this long with no progress line. */
const HEARTBEAT_MS = 8_000;
const MAX_SPOKEN = 5;

const HEARTBEAT_LINES = [
  "This is taking a bit — hang tight.",
  "Still working on it…",
  "Almost there…",
] as const;

/** Opening line when Candor starts backend work. */
export function openingLineForDelegation(
  ctx: VoiceDelegationOpenContext,
): string {
  const t = ctx.requestText.trim().toLowerCase();
  const focus = ctx.focusedTitle?.trim();
  if (focus) {
    return `On it — I'll look at ${clip(focus, 48)}.`;
  }
  if (ctx.needsBrowser) {
    return "On it — I'll check the page you're on.";
  }
  if (ctx.connectorId) {
    const app = friendlyAppName(ctx.connectorId);
    return app
      ? `On it — checking ${app}.`
      : "On it — I'll check your Apps.";
  }
  if (
    /\b(search|look up|lookup|find|google|web|latest|current|news|weather|score)\b/.test(
      t,
    )
  ) {
    return "Yeah, let me search for that.";
  }
  if (/\b(email|gmail|inbox)\b/.test(t)) {
    return "On it — I'll check your email.";
  }
  if (/\b(calendar|schedule|meeting|event)\b/.test(t)) {
    return "On it — I'll check your calendar.";
  }
  if (/\b(stripe|invoice|payment|billing)\b/.test(t)) {
    return "On it — I'll look at Stripe.";
  }
  if (/\b(slack|docs?|drive|sheets?)\b/.test(t)) {
    return "On it — I'll pull that up.";
  }
  return "On it — one sec.";
}

/** Convert agent progress into a speakable one-liner (or null to skip). */
export function spokenLineFromProgress(
  progress: VoiceProgressLike,
): string | null {
  const tool = (progress.toolName || "").toLowerCase();
  const label = (progress.label || "").trim();
  const detail = (progress.detail || "").trim();

  if (progress.phase === "thinking" && !tool) {
    return null;
  }

  if (tool) {
    const fromTool = lineForTool(tool, detail);
    if (fromTool) return fromTool;
  }

  if (detail && !isGenericStatus(detail)) {
    return soften(detail);
  }

  if (label && !isGenericStatus(label)) {
    return soften(label);
  }

  const blob = `${label} ${detail} ${tool}`.toLowerCase();
  if (/\bsearch|web|look up|find\b/.test(blob)) return "Still searching…";
  if (/\bread|open|fetch|load\b/.test(blob)) return "Reading through that now…";
  if (/\bcheck|verif|validat\b/.test(blob)) return "Checking what I found…";
  if (/\bbuild|creat\b/.test(blob)) return "Putting that together…";
  if (/\bupdat|writ|sav\b/.test(blob)) return "Updating that now…";
  if (progress.phase === "tool") return "Working on that…";
  return null;
}

export function createVoiceDelegationNarrator(opts: {
  sendCommentary: (content: string) => void;
  now?: () => number;
  minIntervalMs?: number;
  heartbeatMs?: number;
  maxSpoken?: number;
}): VoiceDelegationNarrator {
  const now = opts.now ?? (() => Date.now());
  const minInterval = opts.minIntervalMs ?? MIN_INTERVAL_MS;
  const heartbeatMs = opts.heartbeatMs ?? HEARTBEAT_MS;
  const maxSpoken = opts.maxSpoken ?? MAX_SPOKEN;

  let spoken = 0;
  let lastAt = Number.NEGATIVE_INFINITY;
  let lastLine = "";
  let finished = false;
  let heartbeatTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  let heartbeatTicks = 0;

  const clearHeartbeat = () => {
    if (heartbeatTimer != null) {
      globalThis.clearTimeout(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  const speak = (line: string, speakOpts?: VoiceProgressSpeakOpts) => {
    if (finished) return;
    const trimmed = line.trim();
    if (!trimmed) return;
    const force = Boolean(speakOpts?.force);
    const t = now();
    if (!force) {
      if (spoken >= maxSpoken) return;
      if (trimmed === lastLine) return;
      if (t - lastAt < minInterval) return;
    }
    lastAt = t;
    lastLine = trimmed;
    spoken += 1;
    opts.sendCommentary(trimmed.slice(0, 280));
    scheduleHeartbeat();
  };

  const scheduleHeartbeat = () => {
    clearHeartbeat();
    if (finished || heartbeatTicks >= HEARTBEAT_LINES.length) return;
    heartbeatTimer = globalThis.setTimeout(() => {
      heartbeatTimer = null;
      if (finished) return;
      // Only fire if nothing has spoken for a full silence window.
      if (now() - lastAt < heartbeatMs - 50) {
        scheduleHeartbeat();
        return;
      }
      const line = HEARTBEAT_LINES[heartbeatTicks] ?? HEARTBEAT_LINES[0];
      heartbeatTicks += 1;
      speak(line);
    }, heartbeatMs);
    const timer = heartbeatTimer as { unref?: () => void };
    timer.unref?.();
  };

  return {
    open(ctx) {
      speak(openingLineForDelegation(ctx), { force: true });
    },
    fromProgress(progress) {
      const line = spokenLineFromProgress(progress);
      if (!line) return;
      speak(line);
    },
    say(line, speakOpts) {
      speak(line, speakOpts);
    },
    finish() {
      finished = true;
      clearHeartbeat();
    },
  };
}

function lineForTool(tool: string, detail: string): string | null {
  if (tool.startsWith("gmail.") || tool.includes("gmail")) {
    return "Looking through your email…";
  }
  if (tool.startsWith("gcal.") || tool.includes("calendar")) {
    return "Checking your calendar…";
  }
  if (tool === "web.search" || tool === "web.research" || tool.includes("web.")) {
    return "Searching the web…";
  }
  if (tool.includes("slack")) {
    return "Checking Slack…";
  }
  if (tool.includes("gdocs") || tool.includes("docs")) {
    return "Opening the document…";
  }
  if (tool.includes("gsheets") || tool.includes("sheets")) {
    return "Looking at the spreadsheet…";
  }
  if (tool.includes("drive") || tool.includes("gdrive")) {
    return "Checking Drive…";
  }
  if (tool.includes("stripe")) {
    return "Looking at Stripe…";
  }
  if (tool.includes("browser")) {
    return "Looking at the page you're on…";
  }
  if (tool.includes("knowledge") || tool === "workspace.search") {
    return "Searching your workspace…";
  }
  if (tool.includes("connector") || tool.includes("composio")) {
    return "Finding the right connection…";
  }
  if (detail && !isGenericStatus(detail)) {
    return soften(detail);
  }
  return "Working on that…";
}

function friendlyAppName(connectorId: string): string | null {
  const id = connectorId.toLowerCase();
  if (id.includes("gmail") || id.includes("google_mail")) return "Gmail";
  if (id.includes("calendar") || id.includes("gcal")) return "Google Calendar";
  if (id.includes("slack")) return "Slack";
  if (id.includes("stripe")) return "Stripe";
  if (id.includes("docs") || id.includes("gdocs")) return "Docs";
  if (id.includes("sheets") || id.includes("gsheets")) return "Sheets";
  if (id.includes("drive")) return "Drive";
  if (id.includes("notion")) return "Notion";
  if (id.includes("linear")) return "Linear";
  if (id.includes("github")) return "GitHub";
  return null;
}

function isGenericStatus(s: string): boolean {
  return /^(thinking|generating|searching|reading|checking|building|updating|starting agent|working|loading)[.…]*$/i.test(
    s.trim(),
  );
}

function soften(raw: string): string {
  let s = raw.replace(/\s+/g, " ").trim();
  s = s.replace(/\b(tool|delegation|MCP|API|JSON|function call)s?\b/gi, "");
  s = s.replace(/\s{2,}/g, " ").trim();
  if (!s) return "Working on that…";
  if (!/[.!?…]$/.test(s)) s = `${s}…`;
  return clip(s, 120);
}

function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trimEnd()}…`;
}
