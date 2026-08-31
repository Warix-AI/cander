/**
 * RUN — execute plan lookups in parallel under browser policy.
 */

import type { AiToolCallResult } from "../runtime/tools.ts";
import { filterLookupsByBrowser } from "./browser-policy.ts";
import { executeLookup } from "./cap-router.ts";
import type { BrowserMode, Lookup, Plan, SimpleEvidence } from "./types.ts";

export async function runLookups(opts: {
  plan: Plan;
  browser: BrowserMode;
  userText: string;
  cache: Map<string, SimpleEvidence>;
  executeTool?: (opts: {
    name: string;
    arguments: Record<string, unknown>;
  }) => Promise<AiToolCallResult>;
  extraLookups?: Lookup[];
}): Promise<{
  evidence: SimpleEvidence[];
  lookupsRun: Lookup[];
  blocked: Lookup[];
}> {
  const requested = [
    ...(opts.plan.lookups?.length
      ? opts.plan.lookups
      : opts.plan.look ?? []),
    ...(opts.extraLookups ?? []),
  ];
  const allowed = filterLookupsByBrowser(
    requested,
    opts.browser,
    opts.userText,
  );
  const blocked = requested.filter(
    (l) => !allowed.some((a) => a.cap === l.cap && a.q === l.q),
  );

  const evidence = await Promise.all(
    allowed.map((lookup) =>
      executeLookup({
        lookup,
        cache: opts.cache,
        executeTool: opts.executeTool,
      }),
    ),
  );

  return { evidence, lookupsRun: allowed, blocked };
}
