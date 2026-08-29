/**
 * Orchestration policy: Cander capabilities override model self-limitation.
 * Keep in sync with lib/ai/orchestrator/policy.ts
 */

export type LiveInfoSignal = {
  needsWeb: boolean;
  /** Broad “what’s going on in the world” style — use multi-query search. */
  broadNews: boolean;
  currentChanging: boolean;
  publicInfo: boolean;
  reason: string;
  signals: string[];
};

/** Phrases that mean the model is opting out instead of using Cander tools. */
const LIMITATION_DEFLECTION = [
  /\bi don'?t have (real[- ]?time|live|current|internet|web)\b/i,
  /\bi (do not|don'?t) have access to (real[- ]?time|the (internet|web|latest)|current)\b/i,
  /\bmy knowledge (cutoff|cut[- ]off|is (limited|outdated)|only goes)\b/i,
  /\bas of (my )?(last|knowledge) (update|cutoff|training)\b/i,
  /\bi('?m| am) (not|un)able to (access|browse|check|search) (the )?(internet|web|live|current)\b/i,
  /\bi can'?t (access|browse|check|search) (the )?(internet|web|real[- ]?time)\b/i,
  /\bi (cannot|can'?t) provide (real[- ]?time|up[- ]?to[- ]?date|current)\b/i,
  /\bi('?m| am) not (aware|up[- ]?to[- ]?date) (of|on) (the )?(latest|current|recent)\b/i,
  /\bi recommend (you )?(check|visit|look(ing)? (up|online|at))\b/i,
  /\byou (should|can|could) (check|visit|look up|search( online)?)\b/i,
  /\bcheck (a |the )?(news|weather|website|site|cnn|bbc|accuweather|weather\.com)\b/i,
  /\blook (it )?up (online|on the (web|internet)|yourself)\b/i,
  /\bfor (the )?(most )?(up[- ]?to[- ]?date|latest|current).{0,40}\b(visit|check|go to|website)\b/i,
  /\bi('?m| am) (just |only )?(a )?(large )?language model\b/i,
  /\bwithout (real[- ]?time|live|internet|web) access\b/i,
  /\bi don'?t have (the )?(ability|capability) to (browse|search|access)\b/i,
];

const LIVE_TEMPORAL =
  /\b(latest|current|today'?s?|tonight|right\s+now|live|recent|newest|new|breaking|ongoing|happening|updates?|announced|released|out\s+yet|this\s+(morning|week|month|year)|yesterday)\b/i;

const LIVE_TOPIC =
  /\b(news|events?|headlines?|weather|forecast|temperature|score|scores|price|prices|stock|stocks|availability|announcement|announcements|results?|standings?|election|earnings|ipo)\b/i;

const WORLD_EVENTS =
  /\b(going\s+on|what('?s| is)\s+happening|what\s+happened|in\s+the\s+world|world\s+(news|events)|top\s+stories|breaking\s+news|major\s+(news|events)|current\s+events)\b/i;

const WEATHER =
  /\b(weather|forecast|temperature|humidity|radar|precip(itation)?|how\s+hot|how\s+cold|rain(ing)?|snow(ing)?)\b/i;

const EXPLICIT_WEB =
  /\b(search|look\s*up|google|bing|brave)\b[\s\S]{0,40}\b(online|web|internet|the\s+web)\b/i;

const WHO_ROLE =
  /\bwho\s+(is|are|was|were)\s+(the\s+)?(ceo|cto|cfo|founder|president|mayor|prime\s+minister)\b/i;

/**
 * Hard live-information detection. Orchestrator treats this as needsWeb=true.
 * Not a soft suggestion to the model.
 */
export function detectLiveInformation(content: string): LiveInfoSignal {
  const t = content.trim();
  const signals: string[] = [];
  if (!t) {
    return {
      needsWeb: false,
      broadNews: false,
      currentChanging: false,
      publicInfo: false,
      reason: "empty",
      signals,
    };
  }

  if (EXPLICIT_WEB.test(t)) signals.push("explicit_web");
  if (WEATHER.test(t)) signals.push("weather");
  if (WORLD_EVENTS.test(t)) signals.push("world_events");
  if (WHO_ROLE.test(t)) signals.push("who_role");
  if (LIVE_TEMPORAL.test(t) && LIVE_TOPIC.test(t)) {
    signals.push("temporal_topic");
  }
  // "latest events" / "current events" / "recent news" even if topic word is events
  if (
    /\b(latest|current|recent|today'?s?|breaking)\b[\s\S]{0,48}\b(events?|news|headlines?|updates?)\b/i.test(
      t,
    )
  ) {
    signals.push("latest_events");
  }
  if (
    /\b(events?|news|headlines?|updates?)\b[\s\S]{0,48}\b(latest|current|recent|today|world)\b/i.test(
      t,
    )
  ) {
    signals.push("events_latest");
  }
  // what's going on / whats happening
  if (
    /\bwhat('?s|s| is)\s+(going\s+on|happening)\b/i.test(t) ||
    /\bwhat\s+happened\b/i.test(t)
  ) {
    signals.push("whats_going_on");
  }
  // current prices / sports / availability
  if (
    /\b(current|latest|today'?s?)\b[\s\S]{0,32}\b(price|prices|stock|score|scores|odds|availability)\b/i.test(
      t,
    ) ||
    /\b(price|stock|score)\b[\s\S]{0,32}\b(today|now|current|latest)\b/i.test(t)
  ) {
    signals.push("live_market_or_score");
  }

  const needsWeb = signals.length > 0;
  const broadNews =
    signals.includes("world_events") ||
    signals.includes("whats_going_on") ||
    (/\b(world|global|international)\b/i.test(t) &&
      /\b(news|events?|happening|going\s+on)\b/i.test(t)) ||
    (/\b(latest|current|today)\b/i.test(t) &&
      /\b(events?|news)\b/i.test(t) &&
      /\b(world|global|everywhere|around)\b/i.test(t));

  return {
    needsWeb,
    broadNews,
    currentChanging: needsWeb,
    publicInfo: needsWeb,
    reason: needsWeb
      ? `live:${signals.join("+")}`
      : "not_live",
    signals,
  };
}

export function isModelLimitationDeflection(text: string): boolean {
  const t = (text ?? "").trim();
  if (!t) return false;
  return LIMITATION_DEFLECTION.some((re) => re.test(t));
}

/**
 * Resourcefulness gate: if info is current/public and web is available but unused,
 * the turn MUST continue to retrieval — model cannot stop.
 */
export function mustContinueToWeb(opts: {
  live: LiveInfoSignal;
  webAvailable: boolean;
  webAttempted: boolean;
  draftIsDeflection?: boolean;
}): boolean {
  if (!opts.webAvailable) return false;
  if (opts.webAttempted) return false;
  if (opts.live.needsWeb && opts.live.currentChanging && opts.live.publicInfo) {
    return true;
  }
  if (opts.draftIsDeflection) return true;
  return false;
}

/** Bounded multi-query plan for broad “world news” asks. */
export function broadNewsSearchQueries(userContent: string): string[] {
  const base = userContent.trim().slice(0, 120);
  return [
    "top world news today",
    "major international news today",
    "major US news today",
    "major technology news today",
  ].filter((q, i, arr) => arr.indexOf(q) === i).slice(0, 3);
  // keep user phrasing as optional first if distinct
  void base;
}

export function primarySearchQuery(userContent: string, live: LiveInfoSignal): string {
  const t = userContent.trim().slice(0, 200);
  if (live.broadNews) return "top world news today";
  if (live.signals.includes("weather")) {
    // Prefer location-preserving query
    return t.length > 8 ? t : "current weather";
  }
  return t;
}

export function assertiveGroundedAnswerPolicy(hasSources: boolean): string {
  if (hasSources) {
    return [
      "You are Cander. You have live retrieved sources for this turn.",
      "Answer directly and assertively from those sources.",
      "Do NOT say you lack real-time access, have a knowledge cutoff, cannot browse the internet, or that the user should check news/weather sites themselves.",
      "Do NOT lead with “According to my search”, “I found”, or “I don’t normally have access”.",
      "Lead with the answer. Cite real source ids or URLs from the provided list only.",
      "Never invent headlines or URLs.",
    ].join(" ");
  }
  return [
    "Live retrieval did not yield usable sources.",
    "Say briefly that you could not find reliable live information right now.",
    "Do not invent news, weather, scores, or URLs.",
    "Do not invent a knowledge-cutoff date as a substitute for retrieval.",
  ].join(" ");
}

/** Strip remaining cutoff/deflection boilerplate if sources were used. */
export function scrubLimitationBoilerplate(text: string): string {
  let out = text;
  out = out.replace(
    /\b(As an AI|As a language model|I('?m| am) (just )?a (large )?language model)[^.!?]*[.!?]\s*/gi,
    "",
  );
  out = out.replace(
    /\bMy knowledge (cutoff|cut-off)[^.!?]*[.!?]\s*/gi,
    "",
  );
  out = out.replace(
    /\bI don'?t have real[- ]?time access[^.!?]*[.!?]\s*/gi,
    "",
  );
  return out.trim();
}
