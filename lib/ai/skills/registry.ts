/**
 * Skill / context registry — placeholders for future structured skills.
 * Skills describe how context is assembled; they do not run on the client.
 */

export type AiSkillDefinition = {
  id: string;
  description: string;
  /** Context kinds this skill may attach. */
  contextKinds: string[];
  enabled: boolean;
};

const skills = new Map<string, AiSkillDefinition>();

export function registerAiSkill(skill: AiSkillDefinition) {
  skills.set(skill.id, skill);
}

export function getAiSkill(id: string): AiSkillDefinition | null {
  return skills.get(id) ?? null;
}

export function listAiSkills(): AiSkillDefinition[] {
  return [...skills.values()];
}

registerAiSkill({
  id: "project-focus",
  description: "Attach a focused Build/Explore project summary to the chat request.",
  contextKinds: ["project", "research"],
  enabled: true,
});

registerAiSkill({
  id: "connector-focus",
  description: "Attach a connector summary when chatting about integrations.",
  contextKinds: ["connector"],
  enabled: false,
});
