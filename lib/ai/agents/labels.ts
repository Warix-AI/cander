/**
 * Human-facing labels for agent builder tools (chat activity, never raw names).
 */

const LABELS: Record<string, string> = {
  "agent.get": "Inspecting expert",
  "agent.update_metadata": "Updating expert",
  "agent.skill.create": "Creating skill",
  "agent.skill.update": "Updating skill",
  "agent.skill.attach": "Attaching skill",
  "agent.skill.remove": "Removing skill",
  "agent.tools.grant": "Allowing connector tools",
  "agent.tools.revoke": "Revoking connector tools",
  "agent.knowledge.attach": "Attaching knowledge",
  "agent.knowledge.remove": "Removing knowledge",
  "agent.trigger.set": "Setting trigger",
  "agent.validate": "Validating expert",
  "agent.run": "Running expert",
};

export function labelForAgentTool(name: string): string {
  return LABELS[name] ?? "Updating expert";
}

export function isAgentBuilderTool(name: string): boolean {
  return name.startsWith("agent.");
}
