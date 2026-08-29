/**
 * Classifier-first routing — no blind on-device → PCC → cloud cascade.
 * Pure helpers (no path aliases).
 */

import {
  isComplexWorkIntent,
  resolveAllowedToolsForTurn,
  type TaskStateLike,
  type ToolDomain,
} from "../tools/domains.ts";
import { getIntelligenceFlags } from "./flags.ts";
import {
  DEFAULT_ROUTING_BUDGETS,
  type IntelligenceTaskType,
  type RouteTarget,
  type RoutingDecision,
} from "./types.ts";

const REASONING_HEAVY: RegExp[] = [
  /\b(analyze|analyse|compare|trade-?offs?|architecture|design doc|long document)\b/i,
  /\b(multi-?constraint|complex plan|strateg(y|ize)|deep dive)\b/i,
  /\bsummarize\b[\s\S]{0,40}\b(document|pdf|article|thread)\b/i,
];

const RESEARCH: RegExp[] = [
  /\b(web research|look up online|search the web|latest news)\b/i,
  /\bresearch (and|&) (compare|investigate|analyze)\b/i,
  /\b(mcp|connector data|connected (gmail|slack|notion))\b/i,
];

const RELEASE: RegExp[] = [
  /\b(publish|go live|promote to production|ship to production)\b/i,
];

const EXECUTION: RegExp[] = [
  /\b(implement|refactor|write tests?|unit tests?|codebase|pull request|pr review)\b/i,
  /\b(build|develop|ship)\b[\s\S]{0,48}\b(app|feature|api|auth|authentication)\b/i,
  /\b(fix|debug|edit|change|update)\b[\s\S]{0,40}\b(code|file|component|preview)\b/i,
  /\bmulti-?step\b|\bend.?to.?end\b/i,
];

function isLocalAction(text: string, domains: ToolDomain[]): boolean {
  if (!domains.length) return false;
  if (domains.includes("cloud_work")) return false;
  return (
    domains.includes("navigation") ||
    domains.includes("projects") ||
    domains.includes("search") ||
    domains.includes("clarification")
  );
}

export function classifyTaskType(opts: {
  content: string;
  taskState?: TaskStateLike;
  projectId?: string | null;
}): IntelligenceTaskType {
  const content = (opts.content || "").trim();
  const gated = resolveAllowedToolsForTurn({
    content,
    taskState: opts.taskState,
  });

  if (RELEASE.some((re) => re.test(content))) return "release";
  if (RESEARCH.some((re) => re.test(content))) return "research";
  if (
    isComplexWorkIntent(content) ||
    EXECUTION.some((re) => re.test(content)) ||
    gated.domains.includes("cloud_work")
  ) {
    return "execution";
  }
  if (REASONING_HEAVY.some((re) => re.test(content))) {
    return "reasoning_heavy";
  }
  if (isLocalAction(content, gated.domains as ToolDomain[])) {
    return "local_action";
  }
  return "conversational";
}

/**
 * Classify then pick a route target.
 * Execution / research / release → cander_cloud immediately (never waste PCC).
 */
export function classifyAndRoute(opts: {
  content: string;
  taskState?: TaskStateLike;
  projectId?: string | null;
  /** User forced LOCAL — never escalate to cloud (privacy). */
  forceLocal?: boolean;
  /** User forced CLOUD. */
  forceCloud?: boolean;
  pccAvailable?: boolean;
}): RoutingDecision {
  const flags = getIntelligenceFlags();
  const taskType = classifyTaskType(opts);
  const gated = resolveAllowedToolsForTurn({
    content: opts.content,
    taskState: opts.taskState,
  });

  let target: RouteTarget = "on_device";
  let reason = "default_on_device";

  if (opts.forceCloud) {
    target = "cander_cloud";
    reason = "user_force_cloud";
  } else if (opts.forceLocal) {
    target = "on_device";
    reason = "user_force_local";
  } else if (
    taskType === "execution" ||
    taskType === "research" ||
    taskType === "release"
  ) {
    target = "cander_cloud";
    reason = `task_type_${taskType}`;
  } else if (taskType === "reasoning_heavy") {
    if (flags.pccEnabled && opts.pccAvailable) {
      target = "pcc";
      reason = "reasoning_heavy_pcc";
    } else if (!opts.forceLocal) {
      // No silent third-party: keep on-device for short reasoning, or cloud only
      // when cloud work is enabled as explicit external path.
      target = flags.cloudWorkEnabled ? "cander_cloud" : "on_device";
      reason = flags.pccEnabled
        ? "pcc_unavailable_fallback"
        : "pcc_disabled_fallback";
    }
  } else if (taskType === "local_action" || taskType === "conversational") {
    target = "on_device";
    reason = `task_type_${taskType}`;
  }

  // Cloud work tools only when flag on and route allows.
  let toolNames = gated.toolNames;
  let domains = gated.domains;
  if (!flags.cloudWorkEnabled) {
    toolNames = toolNames.filter(
      (n) =>
        n !== "create_work_task" &&
        n !== "check_work_task" &&
        n !== "request_publish_approval",
    );
    domains = domains.filter((d) => d !== "cloud_work");
  }

  return {
    taskType,
    target,
    reason,
    domains,
    toolNames,
    budgets: { ...DEFAULT_ROUTING_BUDGETS },
    flags: {
      pccEnabled: flags.pccEnabled,
      cloudWorkEnabled: flags.cloudWorkEnabled,
      sandboxEnabled: flags.sandboxEnabled,
    },
  };
}
