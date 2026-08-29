/**
 * Domain-based tool sets — unlock only after clear intent.
 * Pure data + resolve helpers (no path aliases — safe for node:test / Deno Edge).
 *
 * Keep in sync with `lib/ai/tools/domains.ts`.
 */

export type ToolDomain =
  | "core"
  | "clarification"
  | "navigation"
  | "projects"
  | "search"
  | "scheduling"
  | "comms"
  | "cloud_work"
  | "review";

export const TOOL_DOMAINS: Record<ToolDomain, readonly string[]> = {
  core: [],
  clarification: ["ui.ask_clarification", "ui.confirm"],
  navigation: ["nav.open", "panel.open", "panel.close"],
  projects: ["project.create", "project.open"],
  search: ["workspace.search"],
  scheduling: [],
  comms: [],
  cloud_work: [
    "create_work_task",
    "check_work_task",
    "request_publish_approval",
  ],
  review: [],
};

export type TaskStateLike = {
  status?: string;
  pendingClarification?: {
    resumeTool?: string;
  } | null;
  allowedDomains?: ToolDomain[] | null;
  workTaskId?: string | null;
  step?: string;
} | null;

export function toolsForDomains(domains: Iterable<ToolDomain>): string[] {
  const set = new Set<string>();
  for (const d of domains) {
    for (const name of TOOL_DOMAINS[d] ?? []) set.add(name);
  }
  return [...set];
}

const IN_APP_PATTERNS: RegExp[] = [
  /\b(create|make|new|start)\b[\s\S]{0,40}\bproject\b/i,
  /\bproject\b[\s\S]{0,40}\b(create|make|new)\b/i,
  /\b(open|go to|take me|navigate|switch to|show me)\b[\s\S]{0,48}\b(build|explore|work|settings|connectors|recents|chat|project)\b/i,
  /\b(build|explore|work|settings|connectors|recents)\b[\s\S]{0,24}\b(space|panel|screen|page)\b/i,
  /\b(search|find|list|show)\b[\s\S]{0,40}\b(my |the )?(projects?|workspace|recents)\b/i,
  /\b(delete|remove|archive)\b[\s\S]{0,40}\bproject\b/i,
  /\b(publish|deploy|preview)\b/i,
  /\b(connect|connector)\b[\s\S]{0,24}\b(gmail|slack|calendar|notion)\b/i,
  /\btake me there\b/i,
];

const CONVERSATION_ONLY_PATTERNS: RegExp[] = [
  /^(hi|hey|hello|yo|sup|howdy)\b/i,
  /\bhow('?s| is| are) (it|things|everything|you)\b/i,
  /\bhow (are|r) (you|u)\b/i,
  /\bwhat('?s| is) up\b/i,
  /\bgood (morning|afternoon|evening|night)\b/i,
  /\bthanks?\b|\bthank you\b/i,
  /\bhow (fast|tall|old|big|long|many|much|far)\b/i,
  /\bwhat (is|are|was|were|does|do|did|can)\b/i,
  /\bwho (is|are|was|were)\b/i,
  /\bwhy (is|are|do|does|did|can)\b/i,
  /\bexplain\b|\btell me about\b|\bdefine\b/i,
  /\bjoke\b|\bpoem\b|\bstory\b/i,
];

function isInApp(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (CONVERSATION_ONLY_PATTERNS.some((re) => re.test(t))) {
    if (!IN_APP_PATTERNS.some((re) => re.test(t))) return false;
  }
  return IN_APP_PATTERNS.some((re) => re.test(t));
}

function isConversationOnly(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (isInApp(t)) return false;
  if (CONVERSATION_ONLY_PATTERNS.some((re) => re.test(t))) return true;
  if (
    t.length < 160 &&
    !/\b(project|workspace|build|explore|connector|settings|panel|preview)\b/i.test(
      t,
    )
  ) {
    return (
      /[?]/.test(t) ||
      /^(how|what|who|why|when|where|can|could|should|is|are|do|does)\b/i.test(t)
    );
  }
  return false;
}

/** Complex coding / research / multi-step work → cloud_work only. */
export function isComplexWorkIntent(text: string): boolean {
  const t = (text || "").trim();
  if (!t) return false;
  if (
    isConversationOnly(t) &&
    !/\b(implement|refactor|codebase|sandbox)\b/i.test(t)
  ) {
    return false;
  }
  if (
    /\b(create|make|new)\b[\s\S]{0,40}\bproject\b/i.test(t) &&
    !/\b(implement|code|tests?|refactor|architecture|multi-?step)\b/i.test(t)
  ) {
    return false;
  }
  return (
    /\b(implement|refactor|write tests?|unit tests?|codebase|pull request|pr review)\b/i.test(
      t,
    ) ||
    /\b(build|develop|ship)\b[\s\S]{0,48}\b(app|feature|api|auth|authentication)\b/i.test(
      t,
    ) ||
    /\bresearch (and|&) (compare|analyze|investigate)\b/i.test(t) ||
    /\bmulti-?step\b|\bend.?to.?end\b/i.test(t) ||
    (t.length > 220 &&
      /\b(code|implement|debug|architecture|typescript|react|api)\b/i.test(t))
  );
}

function domainsForResumeTool(resumeTool?: string): ToolDomain[] {
  if (!resumeTool) return ["clarification"];
  if (resumeTool.startsWith("project.")) return ["projects", "clarification"];
  if (resumeTool.startsWith("nav.") || resumeTool.startsWith("panel.")) {
    return ["navigation", "clarification"];
  }
  if (resumeTool === "workspace.search") return ["search", "clarification"];
  if (resumeTool === "create_work_task") return ["cloud_work", "clarification"];
  return ["clarification"];
}

/**
 * Resolve which domains/tools the model may see/execute for this turn.
 * Conversation-first: empty toolNames unless clear in-app or complex work intent.
 */
export function resolveAllowedToolsForTurn(opts: {
  content: string;
  taskState?: TaskStateLike;
  forceDomains?: ToolDomain[];
}): { domains: ToolDomain[]; toolNames: string[] } {
  const domains = new Set<ToolDomain>();
  const content = (opts.content || "").trim();
  const task = opts.taskState ?? null;

  if (opts.forceDomains?.length) {
    for (const d of opts.forceDomains) domains.add(d);
  }

  const taskActive =
    Boolean(task) &&
    task!.status !== "idle" &&
    task!.status !== "completed" &&
    task!.status !== "failed";

  if (taskActive) {
    if (task?.allowedDomains?.length) {
      for (const d of task.allowedDomains) domains.add(d);
    }
    if (task?.pendingClarification) {
      for (const d of domainsForResumeTool(
        task.pendingClarification.resumeTool,
      )) {
        domains.add(d);
      }
    }
    if (task?.workTaskId || task?.step === "work_task_queued") {
      domains.add("cloud_work");
    }
  }

  if (isComplexWorkIntent(content)) {
    domains.add("cloud_work");
  } else if (isInApp(content)) {
    if (
      /\b(create|make|new|start)\b[\s\S]{0,40}\bproject\b/i.test(content) ||
      /\bproject\b[\s\S]{0,40}\b(create|make|new)\b/i.test(content)
    ) {
      domains.add("projects");
      domains.add("clarification");
    }
    if (
      /\b(open|go to|take me|navigate|switch to|show me)\b/i.test(content) ||
      /\b(build|explore|work|settings|connectors|recents)\b[\s\S]{0,24}\b(space|panel|screen|page)\b/i.test(
        content,
      ) ||
      /\btake me there\b/i.test(content)
    ) {
      domains.add("navigation");
    }
    if (
      /\b(search|find|list)\b[\s\S]{0,40}\b(my |the )?(projects?|workspace|recents)\b/i.test(
        content,
      ) ||
      /\b(open|take me to|find)\b[\s\S]{0,40}\bproject\b/i.test(content)
    ) {
      domains.add("search");
      domains.add("projects");
    }
    if (/\b(publish|deploy|preview)\b/i.test(content)) {
      domains.add("navigation");
      domains.add("projects");
    }
    if (/\b(connect|connector)\b/i.test(content)) {
      domains.add("navigation");
    }
  } else if (!taskActive && (isConversationOnly(content) || !content)) {
    return { domains: [], toolNames: [] };
  }

  if (
    !domains.size &&
    !isInApp(content) &&
    !isComplexWorkIntent(content)
  ) {
    return { domains: [], toolNames: [] };
  }

  const toolNames = toolsForDomains(domains);
  return { domains: [...domains], toolNames };
}
