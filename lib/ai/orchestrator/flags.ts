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
