/**
 * VERIFY — evidence gate after tools return.
 * Retrieval success ≠ answer success. Score entity/date/freshness/authority/fit/conflicts.
 */

import type {
  CheckResult,
  EvidenceVerifyScore,
  HydrateResult,
  Intent,
  IntentPlan,
  IntentResult,
  Lookup,
  Plan,
  SimpleEvidence,
} from "./types.ts";
import { syncPlanAliases } from "./types.ts";
import { buildCanonicalLookupQuery } from "./query-normalize.ts";

const CURRENT_YEAR_RE = /\b(20\d{2})\b/g;

const AUTHORITATIVE_HOST_HINTS = [
  ".gov",
  ".edu",
  "wikipedia.org",
  "byu.edu",
  "ncaa.com",
  "mlb.com",
  "nba.com",
  "nfl.com",
  "nhl.com",
  "reuters.com",
  "apnews.com",
  "bbc.",
  "nytimes.com",
  "wsj.com",
  "stripe.com",
  "vercel.com",
  "apple.com",
  "microsoft.com",
  "google.com",
];

const SENSITIVE_FACT_RE =
  /\b(schedule|schedules|date|dates|when|semester|calendar|score|scores|news|headline|price|prices|cost|stock|weather|kickoff|game|match|tournament|election)\b/i;

function contentMentionsEntity(content: string, entity: string): boolean {
  const c = content.toLowerCase();
  const want = entity.toLowerCase();
  if (c.includes(want)) return true;
  const parts = want
    .split(/[.\s_-]+/)
    .filter(
      (p) =>
        p.length > 3 &&
        !/^(com|org|net|edu|gov|www|http|https)$/i.test(p),
    );
  if (!parts.length) return false;
  return parts.some((p) => c.includes(p));
}

function isStaleForYear(content: string, year: number): boolean {
  const years = [...content.matchAll(CURRENT_YEAR_RE)].map((m) => Number(m[1]));
  if (!years.length) return false;
  const hasCurrent = years.includes(year);
  const hasOnlyOlder = years.every((y) => y < year);
  return !hasCurrent && hasOnlyOlder;
}

function hostFromUrl(url: string | null | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function authorityScore(
  ev: SimpleEvidence,
  plan: Plan,
): number {
  const host = hostFromUrl(ev.url);
  const blob = `${ev.title} ${ev.url ?? ""} ${ev.content}`.toLowerCase();
  let score = 0.35;

  if (ev.sourceTool === "web.read") score += 0.2;
  if (AUTHORITATIVE_HOST_HINTS.some((h) => host.includes(h) || blob.includes(h))) {
    score += 0.35;
  }
  for (const ent of plan.entities) {
    const d = ent.toLowerCase().replace(/^www\./, "");
    if (d.includes(".") && (host.includes(d) || host.endsWith(d))) {
      score += 0.25;
      break;
    }
  }
  if (/\b(official|primary source|from the|according to)\b/i.test(blob)) {
    score += 0.1;
  }
  return Math.max(0, Math.min(1, score));
}

function extractDateTokens(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(
    /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:,?\s*20\d{2})?\b/gi,
  )) {
    out.push(m[0]!.toLowerCase().replace(/\s+/g, " "));
  }
  for (const m of text.matchAll(/\b20\d{2}-\d{2}-\d{2}\b/g)) {
    out.push(m[0]!);
  }
  return out;
}

function conflictsWithAccepted(
  candidate: SimpleEvidence,
  accepted: SimpleEvidence[],
): boolean {
  if (!accepted.length) return false;
  const candDates = extractDateTokens(candidate.content);
  if (!candDates.length) return false;
  for (const a of accepted) {
    const aDates = extractDateTokens(a.content);
    if (!aDates.length) continue;
    // Conflict when both assert concrete dates and share no overlap
    const overlap = candDates.some((d) =>
      aDates.some(
        (ad) => ad.includes(d.slice(0, 6)) || d.includes(ad.slice(0, 6)),
      ),
    );
    if (!overlap) return true;
  }
  return false;
}

function answersAsk(
  ev: SimpleEvidence,
  plan: Plan,
): boolean {
  const content = ev.content.toLowerCase();
  if (content.length < 12) return false;
  // URL summary path: page content about the domain is enough
  if (
    plan.answerShape === "summary" &&
    plan.entities.some(
      (e) =>
        contentMentionsEntity(content, e) || (ev.url ?? "").includes(e),
    )
  ) {
    return content.length >= 40;
  }
  for (const ask of plan.asks) {
    const tokens = ask
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter(
        (t) =>
          t.length > 3 &&
          !/^(what|when|where|which|does|about|tell|give|quick|this|year|start)$/.test(
            t,
          ),
      );
    if (!tokens.length) {
      // Date/schedule asks often only have stopwords left — accept dated content for the entity
      if (
        plan.freshnessRequired &&
        /\b(20\d{2}|january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(
          content,
        ) &&
        plan.entities.some(
          (e) =>
            contentMentionsEntity(content, e) ||
            contentMentionsEntity(ev.title, e) ||
            (ev.url ?? "").toLowerCase().includes(e.toLowerCase()),
        )
      ) {
        return true;
      }
      continue;
    }
    const hits = tokens.filter((t) => content.includes(t) || ev.title.toLowerCase().includes(t)).length;
    if (hits >= Math.min(2, tokens.length) || hits / tokens.length >= 0.4) {
      return true;
    }
  }
  // Entity + concrete date is enough for fresh schedule/date asks
  if (
    plan.freshnessRequired &&
    extractDateTokens(ev.content).length > 0 &&
    plan.entities.some(
      (e) =>
        contentMentionsEntity(content, e) ||
        contentMentionsEntity(ev.title, e) ||
        (ev.url ?? "").toLowerCase().includes(e.toLowerCase()),
    )
  ) {
    return true;
  }
  for (const exp of plan.expectedEvidence) {
    const parts = exp
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((t) => t.length > 3);
    if (parts.some((p) => content.includes(p) || ev.title.toLowerCase().includes(p))) {
      return content.length >= 24;
    }
  }
  return content.length >= 80 && /\d/.test(content);
}

export function scoreEvidence(opts: {
  evidence: SimpleEvidence;
  plan: Plan;
  hydrate: HydrateResult;
  alreadyAccepted: SimpleEvidence[];
}): EvidenceVerifyScore {
  const { evidence: ev, plan, hydrate } = opts;
  const reasons: string[] = [];
  const entities =
    plan.entities.length > 0
      ? plan.entities
      : hydrate.entityHints.length
        ? hydrate.entityHints
        : hydrate.urls.map((u) => u.domain);

  let entityOk = true;
  if (hydrate.urls.length === 1) {
    const domain = hydrate.urls[0]!.domain;
    entityOk =
      contentMentionsEntity(ev.content, domain) ||
      contentMentionsEntity(ev.title, domain) ||
      Boolean(ev.url && ev.url.toLowerCase().includes(domain.toLowerCase()));
    if (!entityOk) reasons.push("wrong_entity");
  } else if (entities.length === 1) {
    const ent = entities[0]!;
    entityOk =
      contentMentionsEntity(ev.content, ent) ||
      contentMentionsEntity(ev.title, ent) ||
      Boolean(ev.url && ev.url.toLowerCase().includes(ent.toLowerCase()));
    if (!entityOk) reasons.push("wrong_entity");
  } else if (entities.length > 1) {
    entityOk = entities.some(
      (ent) =>
        contentMentionsEntity(ev.content, ent) ||
        contentMentionsEntity(ev.title, ent) ||
        Boolean(ev.url && ev.url.toLowerCase().includes(ent.toLowerCase())),
    );
    if (!entityOk) reasons.push("wrong_entity");
  }

  const freshnessOk =
    !plan.freshnessRequired || !isStaleForYear(ev.content, hydrate.year);
  if (!freshnessOk) reasons.push("stale_year");

  const dateOk =
    !plan.temporalContext.length ||
    plan.temporalContext.some((t) => {
      const year = t.match(/20\d{2}/)?.[0];
      if (year) return ev.content.includes(year);
      return true;
    }) ||
    !plan.freshnessRequired;
  if (!dateOk && plan.freshnessRequired) reasons.push("date_mismatch");

  const authority = authorityScore(ev, plan);
  if (authority < 0.4 && plan.freshnessRequired) {
    reasons.push("low_authority");
  }

  const answers = answersAsk(ev, plan);
  if (!answers) reasons.push("does_not_answer_ask");

  const conflicts = conflictsWithAccepted(ev, opts.alreadyAccepted);
  if (conflicts) reasons.push("conflicts_with_accepted");

  let score = 0;
  if (entityOk) score += 0.25;
  if (dateOk) score += 0.15;
  if (freshnessOk) score += 0.2;
  score += authority * 0.2;
  if (answers) score += 0.2;
  if (conflicts) score -= 0.35;

  return {
    entityOk,
    dateOk,
    freshnessOk,
    authority,
    answersAsk: answers,
    conflicts,
    score: Math.max(0, Math.min(1, score)),
    reasons,
  };
}

export function isSensitiveCurrentFact(plan: Plan, hydrate: HydrateResult): boolean {
  if (!plan.freshnessRequired && !plan.fresh) return false;
  const blob = `${plan.intent} ${plan.asks.join(" ")} ${hydrate.userText}`;
  return SENSITIVE_FACT_RE.test(blob);
}

export function buildCorroborationLookups(opts: {
  plan: Plan;
  hydrate: HydrateResult;
  accepted: SimpleEvidence[];
}): Lookup[] {
  const plan = syncPlanAliases(opts.plan);
  const primary = opts.accepted[0];
  const ask = plan.asks[0] ?? plan.intent;
  const year = opts.hydrate.year;
  const entity = plan.entities[0] ?? opts.hydrate.entityHints[0] ?? "";
  const q = [
    ask,
    entity,
    String(year),
    "official",
    primary?.url ? `confirm` : "",
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 400);
  return [{ cap: "WEB", q, parallelGroup: "corroborate" }];
}

export function buildRefineLookups(opts: {
  plan: Plan;
  hydrate: HydrateResult;
  rejected: SimpleEvidence[];
  round: number;
  failedIntents?: Intent[];
}): Lookup[] {
  const plan = syncPlanAliases(opts.plan);

  if (opts.failedIntents?.length) {
    return opts.failedIntents.map((intent) => ({
      cap: "WEB" as const,
      q: buildCanonicalLookupQuery({
        entity: intent.entity,
        subject: intent.subject
          ? `${intent.subject} official`
          : `${intent.goal} official`.slice(0, 120),
        goal: intent.goal,
        quantity: intent.quantity,
        rawQ: intent.lookup?.q,
      }),
      parallelGroup: "refine",
      intentId: intent.id,
    }));
  }

  const reasons = new Set(
    opts.rejected.flatMap((r) => r.verify?.reasons ?? [r.rejectReason ?? ""]),
  );

  if (opts.hydrate.urls.length === 1) {
    const u = opts.hydrate.urls[0]!;
    return [
      {
        cap: "WEB",
        q: opts.round >= 1 ? `site:${u.domain}` : u.url,
        parallelGroup: "refine",
      },
    ];
  }

  const ask = plan.asks[0] ?? plan.intent;
  const entity = plan.entities[0] ?? "";
  const year = opts.hydrate.year;

  if (reasons.has("stale_year") || reasons.has("date_mismatch")) {
    return [
      {
        cap: "WEB",
        q: `${ask} ${entity} ${year} official`.trim().slice(0, 400),
        parallelGroup: "refine",
      },
    ];
  }
  if (reasons.has("wrong_entity")) {
    return [
      {
        cap: "WEB",
        q: `${entity} ${ask}`.trim().slice(0, 400),
        parallelGroup: "refine",
      },
    ];
  }
  if (reasons.has("low_authority") || reasons.has("does_not_answer_ask")) {
    return [
      {
        cap: "WEB",
        q: `${ask} ${entity} official primary source ${year}`
          .trim()
          .slice(0, 400),
        parallelGroup: "refine",
      },
    ];
  }

  return (plan.lookups?.length ? plan.lookups : plan.look ?? []).map((l) => ({
    ...l,
    q: `${l.q} ${year} verified`.slice(0, 400),
    parallelGroup: "refine",
  }));
}

/** Per-intent VERIFY — reject stale/wrong-entity/irrelevant for that intent only. */
export function verifyIntentEvidence(opts: {
  intent: Intent;
  evidence: SimpleEvidence[];
  hydrate: HydrateResult;
  plan: Plan;
}): IntentResult {
  const { intent, hydrate, plan } = opts;
  const related = opts.evidence.filter(
    (e) => e.intentId === intent.id || (!e.intentId && opts.evidence.length === 1),
  );
  const pool = related.length ? related : opts.evidence;

  if (intent.action === "ANSWER" || intent.action === "CALC") {
    return {
      intent,
      status: "succeeded",
      evidence: pool,
      accepted: pool.filter((e) => e.ok),
    };
  }

  const accepted: SimpleEvidence[] = [];
  const rejected: SimpleEvidence[] = [];

  for (const ev of pool) {
    if (!ev.ok || ev.content.trim().length < 8) {
      rejected.push({
        ...ev,
        accepted: false,
        rejectReason: ev.rejectReason ?? "empty_or_failed",
      });
      continue;
    }
    const scopedPlan: Plan = {
      ...plan,
      entities: intent.entity ? [intent.entity] : plan.entities,
      asks: [intent.goal],
      freshnessRequired: intent.freshnessRequired,
      fresh: intent.freshnessRequired,
    };
    const verify = scoreEvidence({
      evidence: ev,
      plan: scopedPlan,
      hydrate,
      alreadyAccepted: accepted,
    });
    // Stricter entity check when intent has entity
    let entityOk = verify.entityOk;
    if (intent.entity) {
      const ent = intent.entity.toLowerCase();
      entityOk =
        ev.content.toLowerCase().includes(ent.split(/\s+/)[0] ?? ent) ||
        ev.title.toLowerCase().includes(ent.split(/\s+/)[0] ?? ent) ||
        Boolean(ev.url?.toLowerCase().includes(ent.replace(/\s+/g, "")));
    }
    const pass =
      entityOk &&
      verify.freshnessOk &&
      !verify.conflicts &&
      verify.score >= 0.4;
    if (pass) {
      accepted.push({ ...ev, accepted: true, verify: { ...verify, entityOk } });
    } else {
      rejected.push({
        ...ev,
        accepted: false,
        rejectReason: !entityOk
          ? "wrong_entity"
          : verify.reasons[0] ?? "weak_evidence",
        verify: { ...verify, entityOk },
      });
    }
  }

  if (!accepted.length) {
    return {
      intent,
      status: "unresolved",
      evidence: pool,
      accepted: [],
      rejectReason: rejected[0]?.rejectReason ?? "no_matching_evidence",
    };
  }
  return {
    intent,
    status: "succeeded",
    evidence: pool,
    accepted,
  };
}

/**
 * VERIFY evidence against the INTERPRET plan.
 * Max refine path is owned by the runtime (retry once → deeper search).
 */
export function checkEvidence(opts: {
  plan: Plan;
  hydrate: HydrateResult;
  evidence: SimpleEvidence[];
  lookupsRun: Lookup[];
  round: number;
  corroborationDone?: boolean;
  intentResults?: IntentResult[];
}): CheckResult {
  const plan = syncPlanAliases(opts.plan);
  const intentPlan = plan.intentPlan;

  // Prefer per-intent verification when IntentPlan is present
  if (intentPlan?.intents.length) {
    const intentResults: IntentResult[] = intentPlan.intents.map((intent) => {
      const prior = opts.intentResults?.find((r) => r.intent.id === intent.id);
      if (prior?.status === "skipped") return prior;
      return verifyIntentEvidence({
        intent,
        evidence: opts.evidence,
        hydrate: opts.hydrate,
        plan,
      });
    });

    const accepted = intentResults.flatMap((r) => r.accepted);
    const rejected = opts.evidence.filter(
      (e) => !accepted.some((a) => a.id === e.id),
    );
    const failed = intentResults.filter(
      (r) =>
        r.status === "unresolved" ||
        r.status === "failed",
    );
    const failedToolIntents = failed.filter(
      (r) => r.intent.action !== "ANSWER" && r.intent.action !== "CALC",
    );

    if (failedToolIntents.length && opts.round < 2) {
      return {
        accepted,
        rejected,
        needsRefine: true,
        refineLookups: buildRefineLookups({
          plan,
          hydrate: opts.hydrate,
          rejected,
          round: opts.round,
          failedIntents: failedToolIntents.map((f) => f.intent),
        }),
        needsCorroboration: false,
        needsDeeperSearch: false,
        unresolved: false,
        intentResults,
      };
    }

    const anyUnresolved = failedToolIntents.length > 0;
    return {
      accepted,
      rejected,
      needsRefine: false,
      needsCorroboration: false,
      needsDeeperSearch: anyUnresolved && opts.round >= 2,
      unresolved: anyUnresolved && opts.round >= 2,
      unresolvedReason: anyUnresolved
        ? failedToolIntents.map((f) => f.rejectReason).filter(Boolean).join("; ") ||
          "one or more intents unresolved"
        : undefined,
      intentResults,
    };
  }

  const accepted: SimpleEvidence[] = [];
  const rejected: SimpleEvidence[] = [];

  const needsWeb = (plan.lookups ?? plan.look ?? []).some((l) => l.cap === "WEB");
  const webRan = opts.lookupsRun.some((l) => l.cap === "WEB");
  const webOk = opts.evidence.some((e) => e.cap === "WEB" && e.ok);

  if (needsWeb && !webRan) {
    return {
      accepted: [],
      rejected: opts.evidence,
      needsRefine: opts.round < 2,
      refineLookups: (plan.lookups ?? plan.look)?.filter((l) => l.cap === "WEB"),
      needsCorroboration: false,
      needsDeeperSearch: opts.round >= 2,
      unresolved: opts.round >= 2,
      unresolvedReason: "WEB selected but no web call executed",
    };
  }

  for (const u of opts.hydrate.urls) {
    const fetched = opts.evidence.some(
      (e) =>
        e.cap === "WEB" &&
        e.ok &&
        ((e.url && e.url.toLowerCase().includes(u.domain)) ||
          e.query.toLowerCase().includes(u.domain) ||
          e.content.toLowerCase().includes(u.domain)),
    );
    if (!fetched) {
      const refineQ = opts.round >= 1 ? `site:${u.domain}` : u.url;
      return {
        accepted: [],
        rejected: opts.evidence,
        needsRefine: opts.round < 2,
        refineLookups: [{ cap: "WEB", q: refineQ, parallelGroup: "refine" }],
        needsCorroboration: false,
        needsDeeperSearch: opts.round >= 2,
        unresolved: opts.round >= 2,
        unresolvedReason: `explicit URL ${u.domain} never fetched`,
      };
    }
  }

  // Score each result; prefer higher authority when accepting
  const scored = opts.evidence
    .map((ev) => {
      if (!ev.ok || ev.content.trim().length < 8) {
        return {
          ev: {
            ...ev,
            accepted: false,
            rejectReason: ev.rejectReason ?? "empty_or_failed",
          },
          verify: null as EvidenceVerifyScore | null,
        };
      }
      const verify = scoreEvidence({
        evidence: ev,
        plan,
        hydrate: opts.hydrate,
        alreadyAccepted: accepted,
      });
      return { ev, verify };
    })
    .sort((a, b) => (b.verify?.score ?? -1) - (a.verify?.score ?? -1));

  for (const row of scored) {
    if (!row.verify) {
      rejected.push(row.ev);
      continue;
    }
    const verify = row.verify;
    const pass =
      verify.entityOk &&
      verify.freshnessOk &&
      !verify.conflicts &&
      verify.answersAsk &&
      verify.score >= 0.45;

    if (pass) {
      accepted.push({
        ...row.ev,
        accepted: true,
        verify,
      });
    } else {
      rejected.push({
        ...row.ev,
        accepted: false,
        rejectReason: verify.reasons[0] ?? "weak_evidence",
        verify,
      });
    }
  }

  // Prefer primary/official among accepted
  accepted.sort(
    (a, b) => (b.verify?.authority ?? 0) - (a.verify?.authority ?? 0),
  );

  if (plan.freshnessRequired && !accepted.length) {
    const refineLookups = buildRefineLookups({
      plan,
      hydrate: opts.hydrate,
      rejected,
      round: opts.round,
    });
    return {
      accepted: [],
      rejected,
      needsRefine: opts.round < 2,
      refineLookups,
      needsCorroboration: false,
      needsDeeperSearch: opts.round >= 2,
      unresolved: opts.round >= 2,
      unresolvedReason: "fresh/current ask with no fresh accepted evidence",
    };
  }

  if (needsWeb && !webOk && !accepted.length) {
    return {
      accepted: [],
      rejected,
      needsRefine: opts.round < 2,
      refineLookups: (plan.lookups ?? plan.look)?.filter((l) => l.cap === "WEB"),
      needsCorroboration: false,
      needsDeeperSearch: opts.round >= 2,
      unresolved: opts.round >= 2,
      unresolvedReason: "web lookup failed",
    };
  }

  if (!(plan.lookups?.length || plan.look?.length) && !plan.freshnessRequired) {
    return {
      accepted,
      rejected,
      needsRefine: false,
      needsCorroboration: false,
      needsDeeperSearch: false,
      unresolved: false,
    };
  }

  if (!accepted.length && (plan.lookups?.length || plan.freshnessRequired)) {
    const refineLookups = buildRefineLookups({
      plan,
      hydrate: opts.hydrate,
      rejected,
      round: opts.round,
    });
    return {
      accepted: [],
      rejected,
      needsRefine: opts.round < 2,
      refineLookups,
      needsCorroboration: false,
      needsDeeperSearch: opts.round >= 2,
      unresolved: opts.round >= 2,
      unresolvedReason: "result does not answer the ask",
    };
  }

  // Bounded double-check for sensitive/current facts
  const sensitive = isSensitiveCurrentFact(plan, opts.hydrate);
  const bestAuthority = accepted[0]?.verify?.authority ?? 0;
  const needsCorroboration =
    sensitive &&
    !opts.corroborationDone &&
    accepted.length === 1 &&
    bestAuthority < 0.7 &&
    opts.round < 2;

  if (needsCorroboration) {
    return {
      accepted,
      rejected,
      needsRefine: false,
      needsCorroboration: true,
      corroborateLookups: buildCorroborationLookups({
        plan,
        hydrate: opts.hydrate,
        accepted,
      }),
      needsDeeperSearch: false,
      unresolved: false,
    };
  }

  // After corroboration: if two sources conflict on dates, prefer higher authority
  // or escalate one final targeted verification
  if (
    opts.corroborationDone &&
    accepted.length >= 2 &&
    conflictsWithAccepted(accepted[1]!, [accepted[0]!])
  ) {
    const top = accepted[0]!;
    const second = accepted[1]!;
    if ((top.verify?.authority ?? 0) >= (second.verify?.authority ?? 0) + 0.15) {
      return {
        accepted: [top],
        rejected: [
          ...rejected,
          {
            ...second,
            accepted: false,
            rejectReason: "conflicts_prefer_authoritative",
          },
        ],
        needsRefine: false,
        needsCorroboration: false,
        needsDeeperSearch: false,
        unresolved: false,
      };
    }
    if (opts.round < 2) {
      return {
        accepted: [top],
        rejected,
        needsRefine: true,
        refineLookups: [
          {
            cap: "WEB",
            q: `${plan.asks[0] ?? plan.intent} ${plan.entities[0] ?? ""} ${opts.hydrate.year} official verify`
              .trim()
              .slice(0, 400),
            parallelGroup: "verify_final",
          },
        ],
        needsCorroboration: false,
        needsDeeperSearch: false,
        unresolved: false,
      };
    }
  }

  return {
    accepted,
    rejected,
    needsRefine: false,
    needsCorroboration: false,
    needsDeeperSearch: false,
    unresolved: false,
  };
}

/** Alias for clarity in traces / docs */
export const verifyEvidence = checkEvidence;
