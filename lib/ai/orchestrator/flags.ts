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
