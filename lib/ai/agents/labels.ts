/**
 * Human-facing labels for agent builder tools (chat activity, never raw names).
 */

const LABELS: Record<string, string> = {
  "agent.get": "Inspecting agent",
  "agent.update_metadata": "Updating agent",
  "agent.step.add": "Adding step",
  "agent.step.update": "Updating step",
  "agent.step.delete": "Removing step",
  "agent.step.set_enabled": "Updating step",
  "agent.tools.grant": "Allowing connector tools",
  "agent.tools.revoke": "Revoking connector tools",
  "agent.skill.attach": "Attaching skill",
  "agent.skill.remove": "Removing skill",
  "agent.knowledge.attach": "Attaching knowledge",
  "agent.knowledge.remove": "Removing knowledge",
  "agent.validate": "Validating agent",
};

export function labelForAgentTool(name: string): string {
  return LABELS[name] ?? "Updating agent";
}

export function isAgentBuilderTool(name: string): boolean {
  return name.startsWith("agent.");
}
