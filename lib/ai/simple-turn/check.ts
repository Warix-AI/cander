/**
 * CHECK — evidence gate before answer influence.
 */

import type {
  CheckResult,
  HydrateResult,
  Lookup,
  Plan,
  SimpleEvidence,
} from "./types.ts";

const CURRENT_YEAR_RE = /\b(20\d{2})\b/g;

function contentMentionsEntity(content: string, entity: string): boolean {
  const c = content.toLowerCase();
  const parts = entity.toLowerCase().split(/[.\s_-]+/).filter((p) => p.length > 2);
  if (!parts.length) return c.includes(entity.toLowerCase());
  return parts.some((p) => c.includes(p));
}

function isStaleForYear(content: string, year: number): boolean {
  const years = [...content.matchAll(CURRENT_YEAR_RE)].map((m) => Number(m[1]));
  if (!years.length) return false;
  // Reject if only older years and question is about current year
  const hasCurrent = years.includes(year);
  const hasOnlyOlder = years.every((y) => y < year);
  return !hasCurrent && hasOnlyOlder;
}

export function checkEvidence(opts: {
  plan: Plan;
  hydrate: HydrateResult;
  evidence: SimpleEvidence[];
  lookupsRun: Lookup[];
  round: number;
}): CheckResult {
  const accepted: SimpleEvidence[] = [];
  const rejected: SimpleEvidence[] = [];
  const refineLookups: Lookup[] = [];

  const needsWeb = (opts.plan.look ?? []).some((l) => l.cap === "WEB");
  const webRan = opts.lookupsRun.some((l) => l.cap === "WEB");
  const webOk = opts.evidence.some((e) => e.cap === "WEB" && e.ok);

  if (needsWeb && !webRan) {
    return {
      accepted: [],
      rejected: opts.evidence,
      needsRefine: opts.round < 2,
      refineLookups: opts.plan.look?.filter((l) => l.cap === "WEB"),
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
      return {
        accepted: [],
        rejected: opts.evidence,
        needsRefine: opts.round < 2,
        refineLookups: [{ cap: "WEB", q: u.url }],
        unresolved: opts.round >= 2,
        unresolvedReason: `explicit URL ${u.domain} never fetched`,
      };
    }
  }

  for (const ev of opts.evidence) {
    if (!ev.ok || ev.content.trim().length < 8) {
      rejected.push({
        ...ev,
        accepted: false,
        rejectReason: ev.rejectReason ?? "empty_or_failed",
      });
      continue;
    }

    // Wrong entity check when we have a clear URL/domain target
    if (opts.hydrate.urls.length === 1) {
      const domain = opts.hydrate.urls[0]!.domain;
      if (
        ev.cap === "WEB" &&
        !contentMentionsEntity(ev.content, domain) &&
        !(ev.url && ev.url.includes(domain))
      ) {
        rejected.push({
          ...ev,
          accepted: false,
          rejectReason: "wrong_entity",
        });
        continue;
      }
    }

    if (opts.plan.fresh && isStaleForYear(ev.content, opts.hydrate.year)) {
      rejected.push({
        ...ev,
        accepted: false,
        rejectReason: "stale_year",
      });
      refineLookups.push({
        cap: "WEB",
        q: `${opts.plan.asks[0] ?? opts.plan.intent} ${opts.hydrate.year}`.slice(
          0,
          400,
        ),
      });
      continue;
    }

    accepted.push({ ...ev, accepted: true });
  }

  if (opts.plan.fresh && !accepted.length) {
    return {
      accepted: [],
      rejected,
      needsRefine: opts.round < 2,
      refineLookups: refineLookups.length
        ? refineLookups
        : [{ cap: "WEB", q: opts.plan.intent.slice(0, 400) }],
      unresolved: opts.round >= 2,
      unresolvedReason: "fresh/current ask with no fresh accepted evidence",
    };
  }

  if (needsWeb && !webOk && !accepted.length) {
    return {
      accepted: [],
      rejected,
      needsRefine: opts.round < 2,
      refineLookups: opts.plan.look?.filter((l) => l.cap === "WEB"),
      unresolved: opts.round >= 2,
      unresolvedReason: "web lookup failed",
    };
  }

  // No lookups required
  if (!(opts.plan.look?.length) && !opts.plan.fresh) {
    return {
      accepted,
      rejected,
      needsRefine: false,
      unresolved: false,
    };
  }

  if (!accepted.length && (opts.plan.look?.length || opts.plan.fresh)) {
    return {
      accepted: [],
      rejected,
      needsRefine: opts.round < 2,
      refineLookups: refineLookups.length
        ? refineLookups
        : opts.plan.look,
      unresolved: opts.round >= 2,
      unresolvedReason: "result does not answer the ask",
    };
  }

  return {
    accepted,
    rejected,
    needsRefine: false,
    unresolved: false,
  };
}
