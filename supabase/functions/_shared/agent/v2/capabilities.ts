import type {
  AvailableTool,
  ComplexityClass,
  TurnBudgetState,
  TurnCapabilities,
} from "./types.ts";

const CLIENT_TOOLS: AvailableTool[] = [
  {
    name: "project.create",
    description: "Create a new project in the current workspace",
    category: "projects",
    execution: "client",
    readWrite: "write",
  },
  {
    name: "nav.open",
    description: "Navigate to a Cander space/panel",
    category: "navigation",
    execution: "client",
    readWrite: "write",
  },
  {
    name: "workspace.search",
    description: "Search projects/recents in the workspace",
    category: "workspace",
    execution: "client",
    readWrite: "read",
  },
  {
    name: "knowledge.search",
    description: "Search workspace knowledge-base documents",
    category: "knowledge",
    execution: "client",
    readWrite: "read",
  },
  {
    name: "ui.ask_clarification",
    description: "Ask the user clarifying questions via UI card",
    category: "clarification",
    execution: "client",
    readWrite: "write",
  },
];

function webResearchAvailable(): boolean {
  const enabled = (Deno.env.get("WEB_RESEARCH_ENABLED") ?? "true").toLowerCase();
  if (enabled === "0" || enabled === "false" || enabled === "off") return false;
  const provider = (Deno.env.get("WEB_RESEARCH_PROVIDER") ?? "exa").toLowerCase();
  if (provider === "brave") {
    return Boolean(Deno.env.get("BRAVE_SEARCH_API_KEY"));
  }
  return Boolean(Deno.env.get("EXA_API_KEY"));
}

export function buildCapabilities(opts: {
  hasImages?: boolean;
  locationHint?: string | null;
  userTimezone?: string | null;
}): TurnCapabilities {
  const webSearch = webResearchAvailable();
  return {
    webSearch,
    webRead: webSearch, // Exa Contents; gated by public-URL checks
    workspaceKnowledge: true, // via client pause/resume
    historyRetrieval: true,
    clientTools: CLIENT_TOOLS,
    vision: Boolean(opts.hasImages),
    locationContext: Boolean(opts.locationHint?.trim()),
    serverNowIso: new Date().toISOString(),
    userTimezone: opts.userTimezone ?? null,
    locationHint: opts.locationHint ?? null,
  };
}

export function budgetsForComplexity(
  complexity: ComplexityClass,
): TurnBudgetState {
  if (complexity === "trivial") {
    return {
      complexity,
      maxControllerCycles: 1,
      maxWebSearches: 0,
      maxWebOpens: 0,
      maxModelGenerations: 2,
      maxKnowledgeSearches: 0,
      controllerCycles: 0,
      webSearches: 0,
      webOpens: 0,
      modelGens: 0,
      knowledgeSearches: 0,
    };
  }
  if (complexity === "research") {
    return {
      complexity,
      maxControllerCycles: 10,
      maxWebSearches: 6,
      maxWebOpens: 6,
      maxModelGenerations: 10,
      maxKnowledgeSearches: 2,
      controllerCycles: 0,
      webSearches: 0,
      webOpens: 0,
      modelGens: 0,
      knowledgeSearches: 0,
    };
  }
  return {
    complexity: "normal",
    maxControllerCycles: 6,
    maxWebSearches: 4,
    maxWebOpens: 4,
    maxModelGenerations: 8,
    maxKnowledgeSearches: 2,
    controllerCycles: 0,
    webSearches: 0,
    webOpens: 0,
    modelGens: 0,
    knowledgeSearches: 0,
  };
}

export function budgetRemaining(b: TurnBudgetState): boolean {
  return (
    b.controllerCycles < b.maxControllerCycles &&
    b.modelGens < b.maxModelGenerations
  );
}
