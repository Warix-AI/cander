/** Project Agent Builder types (config only — no live trigger runtime in v1). */

export type ProjectAgent = {
  id: string;
  workspaceId: string;
  projectId: string;
  name: string;
  description: string;
  instructions: string;
  enabled: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type AgentSkillAssignment = {
  id: string;
  agentId: string;
  skillId: string;
  skillLabel: string;
};

export type AgentKnowledgeAssignment = {
  id: string;
  agentId: string;
  sourceKind: "knowledge_base" | "file" | "project_resource";
  sourceId: string;
  sourceLabel: string;
};

export type AgentConnectorScope = {
  id: string;
  agentId: string;
  connectionId: string;
  connectorId: string;
  enabled: boolean;
};

export type AgentToolPermission = {
  id: string;
  agentId: string;
  connectionId: string;
  toolId: string;
  enabled: boolean;
};

export type AgentRouteTrigger = {
  type?: string;
  label?: string;
  config?: Record<string, unknown>;
};

export type AgentRouteCondition = {
  type?: string;
  expression?: string;
  config?: Record<string, unknown>;
};

export type AgentRouteAction = {
  type?: string;
  label?: string;
  config?: Record<string, unknown>;
};

export type AgentRoute = {
  id: string;
  agentId: string;
  name: string;
  enabled: boolean;
  sortOrder: number;
  trigger: AgentRouteTrigger;
  condition: AgentRouteCondition;
  actions: AgentRouteAction[];
  createdAt: string;
  updatedAt: string;
};

export type ProjectAgentBundle = {
  agent: ProjectAgent;
  skills: AgentSkillAssignment[];
  knowledge: AgentKnowledgeAssignment[];
  connectors: AgentConnectorScope[];
  tools: AgentToolPermission[];
  routes: AgentRoute[];
};

export type AgentConfigPatch = {
  name?: string;
  description?: string;
  instructions?: string;
  enabled?: boolean;
  addSkills?: Array<{ skillId: string; skillLabel?: string }>;
  removeSkillIds?: string[];
  addKnowledge?: Array<{
    sourceKind: AgentKnowledgeAssignment["sourceKind"];
    sourceId: string;
    sourceLabel?: string;
  }>;
  removeKnowledgeIds?: string[];
  setConnectorEnabled?: Array<{
    connectionId: string;
    connectorId: string;
    enabled: boolean;
  }>;
  setToolPermissions?: Array<{
    connectionId: string;
    toolId: string;
    enabled: boolean;
  }>;
  upsertRoutes?: Array<Partial<AgentRoute> & { id?: string }>;
  deleteRouteIds?: string[];
};

export type AgentConfigProposal = {
  summary: string;
  patch: AgentConfigPatch;
  /** True when patch touches tools/connectors/knowledge writes that need confirm. */
  requiresConfirmation: boolean;
  confirmationReasons: string[];
};
