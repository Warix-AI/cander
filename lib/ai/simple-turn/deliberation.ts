/**
 * Adaptive INTERPRET deliberation depth — structured, bounded, internal-only.
 * Complexity chooses reasoning budget; code still owns routing/execution.
 */

import type { HydrateResult } from "./types.ts";

export type DeliberationDepth = "SIMPLE" | "NORMAL" | "COMPLEX";

export type PlanHealth = {
  deliberationDepth: DeliberationDepth;
  intentCount: number;
  parallelEligible: number;
  dependentCount: number;
  conditionedCount: number;
  selfCheckIssues: string[];
  repaired: boolean;
  usedHeuristic: boolean;
};

/** Classify how deep INTERPRET should deliberate (no wall-clock timers). */
export function classifyDeliberationDepth(opts: {
  userText: string;
  hydrate: HydrateResult;
}): DeliberationDepth {
  const text = opts.userText.trim();
  const questions = (text.match(/\?/g) ?? []).length;
  const hasCondition =
    /\bif (they|it|that|there|this|i|we)\b/i.test(text) ||
    /\bif .{0,40}\b(under|over|less than|more than|exists?|do|does|play)\b/i.test(
      text,
    );
  const hasPronounRef =
    /\b(it|that|they|them|there|this)\b/i.test(text) &&
    (opts.hydrate.resolved.length > 0 ||
      opts.hydrate.unresolved.length > 0 ||
      Boolean(opts.hydrate.topicHint));
  const multiAsk =
    questions >= 2 ||
    /\b(and|also|then)\b.+\b(when|what|how|do |does |add |find )\b/i.test(text) ||
    (/\band\b/i.test(text) &&
      /\b(from|calories|vs\.?|versus|play)\b/i.test(text));
  const writeAction =
    /\b(add|put|create|schedule|send|email|remind)\b.+\b(calendar|inbox|crm)?/i.test(
      text,
    );
  const followUpContext =
    Boolean(opts.hydrate.topicHint) &&
    (hasPronounRef || /\b(also|and then|how about)\b/i.test(text));

  const toolish =
    /\b(when|what|how many|price|calories|news|schedule|game|search|look up|find)\b/i.test(
      text,
    ) || opts.hydrate.urls.length > 0;

  if (
    (hasCondition && (writeAction || multiAsk)) ||
    (multiAsk && writeAction && toolish) ||
    (followUpContext && multiAsk && toolish && (hasCondition || writeAction))
  ) {
    return "COMPLEX";
  }

  if (multiAsk || hasPronounRef || hasCondition || followUpContext) {
    return "NORMAL";
  }

  // One obvious ask, no refs/deps
  if (questions <= 1 && !hasCondition && !hasPronounRef) {
    return "SIMPLE";
  }

  return "NORMAL";
}

const DELIBERATION_CHECKLIST = [
  "1. What does the user ultimately want?",
  "2. How many distinct asks are present?",
  "3. What prior conversation context matters?",
  "4. What do pronouns like it/that/they/there refer to?",
  "5. Which asks are independent?",
  "6. Which depend on earlier results?",
  "7. Are there conditions such as \"if they do\" or \"if it's under $200\"?",
  "8. What exact facts/data are needed to satisfy each ask?",
  "9. What capability should retrieve each fact?",
  "10. Are the generated lookup queries clean standalone queries rather than copied user prose?",
  "11. Did I preserve every important constraint and ask?",
].join("\n");

/**
 * Build INTERPRET instructions for a depth. Deliberation is internal —
 * the model must emit only IntentPlan JSON (never free-form reasoning).
 */
export function buildInterpretInstructions(depth: DeliberationDepth): string {
  const budget =
    depth === "SIMPLE"
      ? [
          "Deliberation depth: SIMPLE (one obvious ask).",
          "Spend minimal internal reasoning; emit the IntentPlan quickly.",
          "Still produce clean canonical lookup.q if retrieval is needed.",
        ]
      : depth === "NORMAL"
        ? [
            "Deliberation depth: NORMAL (multiple asks and/or conversational references).",
            "Internally work through the checklist below before emitting JSON.",
            "Use a fuller semantic check; keep output bounded to IntentPlan JSON only.",
          ]
        : [
            "Deliberation depth: COMPLEX (tools + dependencies + conditions + follow-up context).",
            "Internally work through the full checklist carefully before emitting JSON.",
            "Prefer a complete dependency-aware plan over a shallow split.",
            "Mark condition + needsFrom on write/follow-on intents; never guess missing facts.",
          ];

  return [
    "You INTERPRET/NORMALIZE the user message into atomic intents BEFORE any tools run.",
    "Perform a short adaptive INTERNAL deliberation, then return ONLY IntentPlan JSON.",
    "Do NOT expose deliberation, chain-of-thought, or checklist answers in the output.",
    "",
    ...budget,
    "",
    "Internal checklist (do not print):",
    DELIBERATION_CHECKLIST,
    "",
    "Return ONLY JSON:",
    "{",
    '  "overallIntent": string,',
    '  "intents": [{',
    '    "id": string,',
    '    "goal": string,',
    '    "action": "ANSWER"|"WEB"|"MEMORY"|"FILES"|"CALENDAR"|"EMAIL"|"CRM"|"CALC"|"BUILD",',
    '    "entity"?: string,',
    '    "subject"?: string,',
    '    "quantity"?: number,',
    '    "constraints": string[],',
    '    "resolvedRefs": string[],',
    '    "unresolvedRefs": string[],',
    '    "freshnessRequired": boolean,',
    '    "dependsOn": string[],',
    '    "condition"?: { "intentId": string, "operator": "exists"|"equals"|"not_equals", "value"?: string },',
    '    "needsFrom"?: { "intentId": string, "fields": string[] },',
    '    "lookup"?: { "q": string }',
    "  }],",
    '  "answer"?: string',
    "}",
    "",
    "Rules:",
    "- Understand the ENTIRE message before splitting.",
    "- Identify every distinct ask; preserve entities, quantities, pronouns, dates, URLs, constraints, actions.",
    "- Only split WEB intents when they are genuinely independent, require different capabilities, or have a real dependency.",
    "- If multiple facts are part of one coherent answer (e.g. combined calorie total across foods), preserve ONE normalized Exa Deep query — do not pre-split into per-brand searches.",
    "- Independent → dependsOn=[]. Dependent → list prior intent ids.",
    '- Conditions like "if they do" → condition on the deciding intent (usually operator "exists").',
    "- Write actions (CALENDAR/EMAIL/CRM) that need retrieved fields → needsFrom with field names.",
    "- Resolve refs from notes; mark ambiguity in unresolvedRefs — never guess.",
    "- lookup.q = canonical FACT query, never copied user prose.",
    "",
    "Query rules (critical):",
    '- Bad: "Taco Bell If I eat three regular tacos"',
    '- Good coherent: "How many total calories are in 10 Taco Bell Spicy Potato Soft Tacos, one McDonald\'s medium Sprite, and one Chick-fil-A Spicy Chicken Sandwich? Give the per-item calorie values and total."',
    "- Reason about the fact needed, then construct lookup.q from that normalized meaning.",
    "",
    "Example — BYU + conditional calendar (different capabilities → split):",
    'User: "When is BYU\'s next football game? Do they play Utah this year? If they do, add it to my calendar."',
    "→ Intent 1 WEB next BYU game; Intent 2 WEB BYU vs Utah this season (parallel);",
    '  Intent 3 CALENDAR dependsOn=[2], condition={intentId:2, operator:"exists"},',
    '  needsFrom={intentId:2, fields:["title","date","kickoff time","location"]}.',
    "",
    "Only set answer when action is ANSWER and no retrieval is needed.",
    "Do not execute tools. Do not invent live facts.",
  ].join("\n");
}

export function buildPlanHealth(opts: {
  depth: DeliberationDepth;
  intentCount: number;
  intents: Array<{
    dependsOn: string[];
    condition?: { intentId: string } | undefined;
  }>;
  selfCheckIssues: string[];
  repaired: boolean;
  usedHeuristic: boolean;
}): PlanHealth {
  const dependentCount = opts.intents.filter((i) => i.dependsOn.length > 0)
    .length;
  const conditionedCount = opts.intents.filter((i) => i.condition).length;
  const parallelEligible = opts.intents.filter(
    (i) => i.dependsOn.length === 0 && !i.condition,
  ).length;
  return {
    deliberationDepth: opts.depth,
    intentCount: opts.intentCount,
    parallelEligible,
    dependentCount,
    conditionedCount,
    selfCheckIssues: opts.selfCheckIssues,
    repaired: opts.repaired,
    usedHeuristic: opts.usedHeuristic,
  };
}
