/**
 * Feature flag for Edge Turn Orchestrator cutover.
 * Default ON — Phase 3 removes the old cloud client agent path.
 * Set NEXT_PUBLIC_AI_AGENT_ORCHESTRATOR=0 to force legacy agent-turn.
 */

export function isAgentOrchestratorEnabled(): boolean {
  const v = process.env.NEXT_PUBLIC_AI_AGENT_ORCHESTRATOR;
  if (v === "0" || v === "false" || v === "off") return false;
  return true;
}

/**
 * Server AI_ORCHESTRATOR_V2 defaults on. Client can force v1 via this flag for debugging.
 * NEXT_PUBLIC_AI_ORCHESTRATOR_V2=0 → request orchestratorVersion: "v1"
 */
export function preferOrchestratorV2(): boolean {
  const v = process.env.NEXT_PUBLIC_AI_ORCHESTRATOR_V2;
  if (v === "0" || v === "false" || v === "off") return false;
  return true;
}

/**
 * Build capability pipeline (BuildSpec / TurnPlan / sandbox tools).
 * Default OFF — independent of the main orchestrator flag.
 * Set NEXT_PUBLIC_AI_BUILD_ORCHESTRATOR=1 to enable.
 */
export function isBuildOrchestratorEnabled(): boolean {
  const v = process.env.NEXT_PUBLIC_AI_BUILD_ORCHESTRATOR;
  if (v === "1" || v === "true" || v === "on") return true;
  return false;
}

/**
 * Local FM + sandbox for routine Build turns when Build orchestrator is on.
 * Default follows isBuildOrchestratorEnabled(); set
 * NEXT_PUBLIC_AI_BUILD_LOCAL=0 to keep Build on the existing cloud path.
 */
export function isBuildLocalOrchestratorEnabled(): boolean {
  if (!isBuildOrchestratorEnabled()) return false;
  const v = process.env.NEXT_PUBLIC_AI_BUILD_LOCAL;
  if (v === "0" || v === "false" || v === "off") return false;
  return true;
}

/**
 * Simple small-model turn runtime (HYDRATE→PLAN→RUN→CHECK→ANSWER→COMMIT).
 * Default OFF — opt in for parity testing beside the TaskGraph local orchestrator.
 * Set NEXT_PUBLIC_AI_SIMPLE_TURN_RUNTIME=1 to enable.
 * Desktop override: localStorage['cander:simple-turn-runtime'] = '1'
 */
export function isSimpleTurnRuntimeEnabled(): boolean {
  if (typeof process !== "undefined") {
    const v = process.env.NEXT_PUBLIC_AI_SIMPLE_TURN_RUNTIME;
    if (v === "1" || v === "true" || v === "on") return true;
    if (v === "0" || v === "false" || v === "off") return false;
  }
  if (typeof window !== "undefined") {
    try {
      const ls = window.localStorage?.getItem("cander:simple-turn-runtime");
      if (ls === "1" || ls === "true" || ls === "on") return true;
      if (ls === "0" || ls === "false" || ls === "off") return false;
    } catch {
      /* ignore */
    }
  }
  return false;
}

/**
 * Open-web Exa retrieval depth.
 * Default `deep_default` — prefer Exa deep/agent-style retrieval for factual/current
 * questions instead of fast/instant one-shot search. Explicit URL opens stay direct-fetch.
 * Benchmark later with NEXT_PUBLIC_WEB_RETRIEVAL_MODE=fast|auto.
 * Edge secret mirror: WEB_RETRIEVAL_MODE (no NEXT_PUBLIC_ on Edge).
 */
export type WebRetrievalModeFlag = "deep_default" | "fast" | "auto";

export function getWebRetrievalMode(): WebRetrievalModeFlag {
  const read = (v: string | undefined | null): WebRetrievalModeFlag | null => {
    if (!v) return null;
    const n = v.toLowerCase();
    if (n === "fast" || n === "instant") return "fast";
    if (n === "auto") return "auto";
    if (n === "deep_default" || n === "deep" || n === "deep-default") {
      return "deep_default";
    }
    return null;
  };

  if (typeof process !== "undefined") {
    const fromPublic = read(process.env.NEXT_PUBLIC_WEB_RETRIEVAL_MODE);
    if (fromPublic) return fromPublic;
    const fromServer = read(process.env.WEB_RETRIEVAL_MODE);
    if (fromServer) return fromServer;
  }
  if (typeof window !== "undefined") {
    try {
      const ls = read(window.localStorage?.getItem("cander:web-retrieval-mode"));
      if (ls) return ls;
    } catch {
      /* ignore */
    }
  }
  return "deep_default";
}

export function isWebRetrievalDeepDefault(): boolean {
  return getWebRetrievalMode() === "deep_default";
}
