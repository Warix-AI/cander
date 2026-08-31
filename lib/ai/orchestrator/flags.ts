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
 * V6 runtime — single runTurn() pipeline (surface → coverage → render).
 * Default ON — sole path for normal chat; set NEXT_PUBLIC_AI_V6_RUNTIME=0 to roll back
 * to Simple Turn / TaskGraph / Edge branching.
 * Desktop override: localStorage['cander:v6-runtime'] = '0' | '1'
 */
export function isV6RuntimeEnabled(): boolean {
  if (typeof process !== "undefined") {
    const v = process.env.NEXT_PUBLIC_AI_V6_RUNTIME;
    if (v === "1" || v === "true" || v === "on") return true;
    if (v === "0" || v === "false" || v === "off") return false;
  }
  if (typeof window !== "undefined") {
    try {
      const ls = window.localStorage?.getItem("cander:v6-runtime");
      if (ls === "1" || ls === "true" || ls === "on") return true;
      if (ls === "0" || ls === "false" || ls === "off") return false;
    } catch {
      /* ignore */
    }
  }
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
 * Open-web Exa retrieval — normal chat uses Exa Search type="deep" only.
 * Mode ladder (instant/fast/auto/deep-lite/deep-reasoning/agent) is disabled
 * until deliberately re-enabled. Explicit URL opens stay direct-fetch.
 *
 * Env vars kept for ops rollback documentation only; runtime ignores them.
 */
export type WebRetrievalModeFlag = "deep_only" | "deep_default" | "fast" | "auto";

export function getWebRetrievalMode(): WebRetrievalModeFlag {
  return "deep_only";
}

export function isWebRetrievalDeepDefault(): boolean {
  return true;
}
