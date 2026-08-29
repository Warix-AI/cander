/**
 * Phase 3: cloud intelligence is the Edge TurnOrchestrator.
 * Legacy client agent loop remains only for force-local / on-device mode
 * and when NEXT_PUBLIC_AI_AGENT_ORCHESTRATOR=0.
 *
 * Cap / web / desktop share runOrchestratedTurn → ai-agent run_turn.
 */

export { isAgentOrchestratorEnabled } from "./flags";
export { runOrchestratedTurn, cancelActiveOrchestratorTurn } from "./run-turn";
export { routeDeterministic } from "./router";
