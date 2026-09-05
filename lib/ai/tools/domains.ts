/**
 * Domain-based tool sets — unlock only after clear intent.
 * Pure data + resolve helpers (no path aliases — safe for node:test).
 *
 * Edge mirror: keep `supabase/functions/_shared/tool-domains.ts` in sync
 * with this file (copy when domains / resolveAllowedToolsForTurn change).
 */

import { refersToActiveBrowserSurface } from "../../browser-context/routing.ts";
import { extractRequestedUrl } from "../orchestrator/web-retrieval.ts";

export type ToolDomain =
  | "core"
  | "clarification"
  | "navigation"
  | "projects"
  | "search"
  | "knowledge"
  | "web"
  | "computer"
  | "browser"
  | "scheduling"
  | "comms"
  | "cloud_work"
  | "review"
  | "build"
  | "health";

export const TOOL_DOMAINS: Record<ToolDomain, readonly string[]> = {
  core: [],
  clarification: ["ui.ask_clarification", "ui.confirm"],
  navigation: ["nav.open", "panel.open", "panel.close"],
  projects: ["project.create", "project.open"],
  search: ["workspace.search"],
  knowledge: ["knowledge.search"],
  web: ["web.search", "web.open", "web.read", "web.research"],
  computer: [
    "computer.browser.open",
    "computer.browser.observe",
    "computer.browser.click",
    "computer.browser.fill",
    "computer.browser.requestUserControl",
    "computer.files.read",
    "computer.files.write",
    "computer.files.patch",
    "computer.files.list",
    "computer.exec",
    "computer.port.expose",
  ],
  browser: [
    "browser.current.get_context",
    "browser.current.get_selection",
    "browser.current.capture_viewport",
    "browser.current.get_metadata",
  ],
  scheduling: [
    "gcal.listCalendars",
    "gcal.listEvents",
    "gcal.findEvents",
    "gcal.createEvent",
    "gcal.quickAdd",
  ],
  comms: [
    "gmail.search",
    "gmail.read",
    "gmail.send",
    "gmail.draft",
    "gmail.reply",
    "slack.search",
    "slack.read",
    "slack.send",
  ],
  cloud_work: [
    "create_work_task",
    "check_work_task",
    "request_publish_approval",
  ],
  review: [],
  build: [
    "build.spec.read",
    "build.spec.patch",
    "build.page.add",
    "build.component.search",
    "build.component.replace",
    "build.recipe.apply",
    "build.auth.configure",
    "build.dependencies.ensure",
    "build.validate",
    "build.preview.inspect",
    "build.publish",
  ],
  health: ["health.query", "health.compare", "health.workouts"],
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
  // "what projects do I have?" / "which projects are there?" — inventory, not chitchat
  /\b(what|which|any)\b[\s\S]{0,48}\bprojects?\b/i,
  /\bprojects?\b[\s\S]{0,40}\b(do i have|do we have|have i|are there|exist)\b/i,
  /\b(delete|remove|archive)\b[\s\S]{0,40}\bproject\b/i,
  /\b(publish|deploy|preview)\b/i,
  /\b(connect|connector)\b[\s\S]{0,24}\b(gmail|slack|calendar|notion)\b/i,
  /\btake me there\b/i,
  // Internal / workspace knowledge (pricing, policy, KB docs)
  /\b(knowledge\s*bases?|internal\s+docs?|our\s+(pricing|policy|policies|customers?))\b/i,
  /\b(what('?s| is)|whats)\b[\s\S]{0,48}\b(our|the)\b[\s\S]{0,24}\b(pricing|price|rates?|policy|policies)\b/i,
  /\b(pricing|rates?)\b[\s\S]{0,40}\b(we|our|customers?|offer|charge)\b/i,
  /\b(search|find|look\s*up|check)\b[\s\S]{0,40}\b(knowledge|internal|pricing|policy)\b/i,
  // Live web / internet lookup
  /\b(search|look\s*up|google|bing)\b[\s\S]{0,40}\b(online|web|internet|the\s+web)\b/i,
  /\b(search|look\s*up)\b[\s\S]{0,24}\b(for|up)\b/i,
  /\b(what('?s| is)|whats)\b[\s\S]{0,40}\b(latest|current|today|news|weather|stock|score)\b/i,
  /\b(latest|current|today'?s)\b[\s\S]{0,40}\b(news|weather|price|score|headline)\b/i,
  /\b(who\s+won|box\s+score|stock\s+price|weather\s+in)\b/i,
  /\b(happened|going\s+on|what's\s+new)\b[\s\S]{0,40}\b(news|headline|today)\b/i,
  /\bin\s+the\s+news\b/i,
  /\b(news|headlines?)\b[\s\S]{0,24}\b(today|tonight|this\s+(morning|week))\b/i,
  /\b(today|tonight)\b[\s\S]{0,40}\b(news|headlines?|weather)\b/i,
  /\bannounce[d]?\b[\s\S]{0,40}\b(today|yesterday|this\s+week)\b/i,
  /\b(today|yesterday|this\s+week)\b[\s\S]{0,40}\bannounce/i,
  /\b(check|get|find)\b[\s\S]{0,24}\b(the\s+)?weather\b/i,
  /\bhow('?s| is)\b[\s\S]{0,24}\b(the\s+)?weather\b/i,
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
  if (resumeTool === "knowledge.search") return ["knowledge", "clarification"];
  if (resumeTool === "web.search") return ["web", "clarification"];
  if (resumeTool === "create_work_task") return ["cloud_work", "clarification"];
  if (
    resumeTool === "gmail.search" ||
    resumeTool === "gmail.read" ||
    resumeTool === "gmail.send" ||
    resumeTool === "gmail.draft" ||
    resumeTool === "gmail.reply"
  ) {
    return ["comms", "clarification"];
  }
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

  if (refersToActiveBrowserSurface(content)) {
    domains.add("browser");
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
  } else if (extractRequestedUrl(content)) {
    domains.add("web");
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
      /\b(search|find|list|show)\b[\s\S]{0,40}\b(my |the )?(projects?|workspace|recents)\b/i.test(
        content,
      ) ||
      /\b(what|which|any)\b[\s\S]{0,48}\bprojects?\b/i.test(content) ||
      /\bprojects?\b[\s\S]{0,40}\b(do i have|do we have|have i|are there|exist)\b/i.test(
        content,
      ) ||
      /\b(open|take me to|find)\b[\s\S]{0,40}\bproject\b/i.test(content)
    ) {
      domains.add("search");
      domains.add("projects");
    }
    if (
      /\b(knowledge\s*bases?|internal\s+docs?|our\s+(pricing|policy|policies|customers?))\b/i.test(
        content,
      ) ||
      /\b(what('?s| is)|whats)\b[\s\S]{0,48}\b(our|the)\b[\s\S]{0,24}\b(pricing|price|rates?|policy|policies)\b/i.test(
        content,
      ) ||
      /\b(pricing|rates?)\b[\s\S]{0,40}\b(we|our|customers?|offer|charge)\b/i.test(
        content,
      ) ||
      /\b(search|find|look\s*up|check)\b[\s\S]{0,40}\b(knowledge|internal|pricing|policy)\b/i.test(
        content,
      )
    ) {
      domains.add("knowledge");
    }
    if (
      /\b(search|look\s*up|google|bing)\b[\s\S]{0,40}\b(online|web|internet|the\s+web)\b/i.test(
        content,
      ) ||
      /\b(search|look\s*up)\b[\s\S]{0,24}\b(for|up)\b/i.test(content) ||
      /\b(what('?s| is)|whats)\b[\s\S]{0,40}\b(latest|current|today|news|weather|stock|score)\b/i.test(
        content,
      ) ||
      /\b(latest|current|today'?s)\b[\s\S]{0,40}\b(news|weather|price|score|headline)\b/i.test(
        content,
      ) ||
      /\b(who\s+won|box\s+score|stock\s+price|weather\s+in)\b/i.test(content) ||
      /\b(happened|going\s+on|what's\s+new)\b[\s\S]{0,40}\b(news|headline|today)\b/i.test(
        content,
      ) ||
      /\bin\s+the\s+news\b/i.test(content) ||
      /\b(news|headlines?)\b[\s\S]{0,24}\b(today|tonight|this\s+(morning|week))\b/i.test(
        content,
      ) ||
      /\b(today|tonight)\b[\s\S]{0,40}\b(news|headlines?|weather)\b/i.test(
        content,
      ) ||
      /\bannounce[d]?\b[\s\S]{0,40}\b(today|yesterday|this\s+week)\b/i.test(
        content,
      ) ||
      /\b(today|yesterday|this\s+week)\b[\s\S]{0,40}\bannounce/i.test(content) ||
      /\b(check|get|find)\b[\s\S]{0,24}\b(the\s+)?weather\b/i.test(content) ||
      /\bhow('?s| is)\b[\s\S]{0,24}\b(the\s+)?weather\b/i.test(content)
    ) {
      domains.add("web");
    }
    if (/\b(publish|deploy|preview)\b/i.test(content)) {
      domains.add("navigation");
      domains.add("projects");
    }
    if (/\b(connect|connector)\b/i.test(content)) {
      domains.add("navigation");
    }
    if (
      /\b(gmail|inbox|e-?mail|emails?|mailbox)\b/i.test(content) ||
      /\b(unread|sent|drafts?)\b[\s\S]{0,32}\b(mail|email|message)/i.test(content) ||
      /\b(check|read|search|find|summarize|show|list)\b[\s\S]{0,40}\b(my )?(email|mail|inbox|gmail)\b/i.test(
        content,
      )
    ) {
      domains.add("comms");
    }
    if (
      /\b(google\s+calendar|gcal|g\s+calendar)\b/i.test(content) ||
      /\b(calendar|calendars|agenda|schedule|schedules)\b/i.test(content) ||
      /\b(what('?s| is)|whats)\b[\s\S]{0,40}\b(on my|on the)\b[\s\S]{0,24}\b(calendar|schedule|agenda)\b/i.test(
        content,
      ) ||
      /\b(check|read|show|list|find|summarize)\b[\s\S]{0,40}\b(my )?(calendar|schedule|agenda|events?)\b/i.test(
        content,
      )
    ) {
      domains.add("scheduling");
    }
  } else if (
    !taskActive &&
    !domains.size &&
    (isConversationOnly(content) || !content)
  ) {
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

/** True when the user message should unlock Gmail connector tools. */
export function isCommsConnectorIntent(content: string): boolean {
  const text = (content || "").trim();
  if (!text) return false;
  return (
    /\b(gmail|inbox|e-?mail|emails?|mailbox)\b/i.test(text) ||
    /\b(unread|sent|drafts?)\b[\s\S]{0,32}\b(mail|email|message)/i.test(text) ||
    /\b(check|read|search|find|summarize|show|list)\b[\s\S]{0,40}\b(my )?(email|mail|inbox|gmail)\b/i.test(
      text,
    )
  );
}

/** True when the user message should unlock calendar connector tools. */
export function isCalendarConnectorIntent(content: string): boolean {
  const text = (content || "").trim();
  if (!text) return false;
  return (
    /\b(google\s+calendar|gcal|g\s+calendar)\b/i.test(text) ||
    /\b(calendar|calendars|agenda)\b/i.test(text) ||
    /\b(what('?s| is)|whats)\b[\s\S]{0,40}\b(on my|on the)\b[\s\S]{0,24}\b(calendar|schedule|agenda)\b/i.test(
      text,
    ) ||
    /\b(check|read|show|list|find|summarize|add|create|book)\b[\s\S]{0,40}\b(my )?(calendar|schedule|agenda|events?)\b/i.test(
      text,
    )
  );
}
