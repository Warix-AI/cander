/**
 * Research turn plan — atomic subtasks, completion validation, deterministic calc.
 * Compiled per turn; wired into TurnProfile (not Build TurnPlan).
 */

import type { TurnTaskResolution } from "./turn-task.ts";
import type { TurnEvidence } from "../orchestrator/evidence.ts";
import {
  extractNumericFacts,
  resolveComponentFacts,
  sumVerifiedComponents,
  type ComponentFact,
  type EvidenceSnippet,
} from "../orchestrator/research-quality.ts";

export type ResearchSubtask = {
  id: string;
  query: string;
  quantity?: number;
  fields?: string[];
  entity?: string;
  dependsOn?: string[];
  label: string;
};

export type ResearchCalculation = "sum" | "compare" | "none";

export type ResearchTurnPlan = {
  objective: string;
  calculation: ResearchCalculation;
  subtasks: ResearchSubtask[];
  completionCriteria: string[];
  unresolved: string[];
  retrievalRound: number;
  maxRetrievalRounds: number;
};

export type ResearchCompletionResult = {
  complete: boolean;
  unresolved: string[];
  facts: ComponentFact[];
  calculatedTotal?: number;
  calculatedBreakdown?: string;
};

const WORD_NUM: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
};

const BRAND_FROM = /\bfrom\s+([A-Za-z][\w\s.'-]+?)(?:\s+and|\s*[,+]|$)/gi;
const QTY_ITEM =
  /(\d+|one|two|three|four|five|six)\s+(.+?)(?:\s+from\s+([A-Za-z][\w\s.'-]+))?/gi;
const COMPARE_ENTITIES =
  /\bcompare\b[\s\S]*?(?:^|[\s,])([A-Za-z][\w\s.'-]*\d+[A-Za-z\w\s.'-]*)(?:\s*,\s*|\s+and\s+)([A-Za-z][\w\s.'-]*\d+[A-Za-z\w\s.'-]*)(?:\s*,\s*|\s+and\s+)?([A-Za-z][\w\s.'-]*\d+[A-Za-z\w\s.'-]*)?/i;

function slugId(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
}

function parseQuantity(raw: string): number {
  const n = Number.parseInt(raw, 10);
  if (Number.isFinite(n)) return n;
  return WORD_NUM[raw.toLowerCase()] ?? 1;
}

/** Extract branded multi-item calorie asks into atomic subtasks. */
export function decomposeCalorieSubtasks(content: string): ResearchSubtask[] {
  const q = content.trim();
  if (!/\bcalorie/i.test(q)) return [];

  const subtasks: ResearchSubtask[] = [];
  const seen = new Set<string>();

  const hadMatch = /\b(had|have|ate|eat|order)\b/i.test(q);
  if (!hadMatch && !/\bhow many\b/i.test(q)) return [];

  const segments = q
    .replace(/\bhow many calories.*$/i, "")
    .split(/\s+and\s+|\s*,\s*|\s*\+\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const seg of segments) {
    const cleanSeg = seg
      .replace(/^(?:if i\s+)?(?:had|have|ate|order)\s+/i, "")
      .replace(/^a\s+/i, "")
      .trim();
    const m = cleanSeg.match(
      /^(?:(\d+|one|two|three|four|five|six)\s+)?(.+?)(?:\s+from\s+(.+))?$/i,
    );
    if (!m?.[2]) continue;
    const qty = m[1] ? parseQuantity(m[1]) : 1;
    const item = m[2].trim().replace(/\?+$/, "");
    const brand = (m[3] ?? "").trim().replace(/\?+$/, "");
    if (item.length < 3) continue;

    const label = brand ? `${brand} ${item}` : item;
    const id = slugId(label);
    if (seen.has(id)) continue;
    seen.add(id);

    const query = brand
      ? `${brand} ${item} calories official nutrition`
      : `${item} calories official nutrition`;

    subtasks.push({
      id,
      query,
      quantity: qty,
      entity: brand || item,
      label,
      fields: ["calories"],
    });
  }

  return subtasks;
}

/** Extract compare-product subtasks (prices, battery, etc.). */
export function decomposeCompareSubtasks(
  content: string,
  requestedFields?: string[],
): ResearchSubtask[] {
  const q = content.trim();
  if (!/\bcompare\b/i.test(q)) return [];

  const fields =
    requestedFields?.length ? requestedFields : inferCompareFields(q);
  const entityRe =
    /\b(iPhone\s*\d+|Pixel\s*\d+|Galaxy\s*S\d+|Samsung\s*Galaxy\s*S\d+|[A-Z][a-z]+\s+\d+)\b/gi;
  const entities = [...new Set((q.match(entityRe) ?? []).map((e) => e.trim()))];
  if (entities.length < 2) return [];

  return entities.map((entity) => ({
    id: slugId(entity),
    query: `${entity} ${fields.join(" ")} official specs`,
    entity,
    label: entity,
    fields,
  }));
}

function inferCompareFields(q: string): string[] {
  const fields: string[] = [];
  if (/\bprice/i.test(q)) fields.push("price");
  if (/\bbatter/i.test(q)) fields.push("battery");
  if (/\bstorage|memory/i.test(q)) fields.push("storage");
  if (/\bscreen|display/i.test(q)) fields.push("display");
  if (!fields.length) fields.push("price", "specs");
  return fields;
}

export function compileResearchTurnPlan(opts: {
  content: string;
  turnTask: TurnTaskResolution;
}): ResearchTurnPlan | null {
  const content = opts.content.trim();
  const calorieSubs = decomposeCalorieSubtasks(content);
  if (calorieSubs.length >= 2) {
    return {
      objective: "total_calories",
      calculation: "sum",
      subtasks: calorieSubs,
      completionCriteria: calorieSubs.map((s) => `${s.id} resolved`),
      unresolved: calorieSubs.map((s) => s.id),
      retrievalRound: 0,
      maxRetrievalRounds: 2,
    };
  }

  const compareSubs = decomposeCompareSubtasks(
    content,
    opts.turnTask.requestedFields,
  );
  if (compareSubs.length >= 2) {
    return {
      objective: "compare",
      calculation: "compare",
      subtasks: compareSubs,
      completionCriteria: compareSubs.map((s) => `${s.id} resolved`),
      unresolved: compareSubs.map((s) => s.id),
      retrievalRound: 0,
      maxRetrievalRounds: 2,
    };
  }

  if (calorieSubs.length === 1) {
    const s = calorieSubs[0]!;
    return {
      objective: "lookup",
      calculation: "none",
      subtasks: [s],
      completionCriteria: [`${s.id} resolved`],
      unresolved: [s.id],
      retrievalRound: 0,
      maxRetrievalRounds: 2,
    };
  }

  return null;
}

function evidenceForSubtask(
  subtaskId: string,
  evidence: TurnEvidence[],
): TurnEvidence[] {
  return evidence.filter(
    (e) =>
      e.ok &&
      (e.subtaskId === subtaskId ||
        e.id.startsWith(`st_${subtaskId}_`) ||
        e.id.includes(subtaskId) ||
        e.title.toLowerCase().includes(subtaskId.replace(/_/g, " "))),
  );
}

function subtaskFacts(
  subtask: ResearchSubtask,
  evidence: TurnEvidence[],
): ComponentFact {
  const items = evidenceForSubtask(subtask.id, evidence);
  const snippets: EvidenceSnippet[] = items.map((e) => ({
    id: e.id,
    title: e.title,
    url: e.url,
    content: e.content,
    kind: e.kind,
  }));
  if (!snippets.length) {
    const blob = evidence
      .filter((e) => e.ok)
      .map((e) => `${e.title} ${e.content}`)
      .join(" ");
    if (
      subtask.entity &&
      blob.toLowerCase().includes(subtask.entity.toLowerCase().slice(0, 8))
    ) {
      snippets.push(
        ...evidence
          .filter((e) => e.ok)
          .map((e) => ({
            id: e.id,
            title: e.title,
            url: e.url,
            content: e.content,
            kind: e.kind,
          })),
      );
    }
  }
  const facts = resolveComponentFacts({
    components: [subtask.label, subtask.entity ?? subtask.label],
    evidence: snippets,
  });
  const base =
    facts.find((f) => f.value != null) ??
    facts[0] ?? {
    label: subtask.label,
    value: null,
    unit: "cal",
    sourceIds: [],
    conflicting: false,
  };
  if (base.value != null && subtask.quantity && subtask.quantity > 1) {
    return {
      ...base,
      value: base.value * subtask.quantity,
      label: `${subtask.label} (×${subtask.quantity})`,
    };
  }
  return base;
}

export function validateResearchCompletion(
  plan: ResearchTurnPlan,
  evidence: TurnEvidence[],
): ResearchCompletionResult {
  const facts: ComponentFact[] = [];
  const unresolved: string[] = [];

  for (const st of plan.subtasks) {
    const fact = subtaskFacts(st, evidence);
    facts.push(fact);
    if (fact.value == null || fact.conflicting) {
      unresolved.push(st.id);
    }
  }

  let calculatedTotal: number | undefined;
  let calculatedBreakdown: string | undefined;

  if (plan.calculation === "sum" && unresolved.length === 0) {
    const perItem = plan.subtasks.map((st, i) => {
      const raw = resolveComponentFacts({
        components: [st.label],
        evidence: evidenceForSubtask(st.id, evidence).map((e) => ({
          id: e.id,
          title: e.title,
          url: e.url,
          content: e.content,
          kind: e.kind,
        })),
      })[0];
      const unit = raw?.value ?? null;
      const qty = st.quantity ?? 1;
      return {
        label: st.label,
        unitValue: unit,
        total: unit != null ? unit * qty : null,
        qty,
      };
    });
    if (perItem.every((p) => p.unitValue != null)) {
      calculatedTotal = perItem.reduce((s, p) => s + (p.total ?? 0), 0);
      calculatedBreakdown = perItem
        .map(
          (p) =>
            `${stSlug(p.label)}: ${p.unitValue} cal × ${p.qty} = ${p.total} cal`,
        )
        .join("\n");
    } else {
      const sum = sumVerifiedComponents(facts);
      if (sum?.verified) {
        calculatedTotal = sum.total;
      }
    }
  }

  const complete =
    unresolved.length === 0 &&
    (plan.calculation !== "sum" || calculatedTotal != null);

  return {
    complete,
    unresolved,
    facts,
    calculatedTotal,
    calculatedBreakdown,
  };
}

function stSlug(label: string): string {
  return slugId(label);
}

export function buildResolvedFactsInstruction(opts: {
  question: string;
  plan: ResearchTurnPlan;
  completion: ResearchCompletionResult;
}): string {
  const lines = [
    "## CURRENT REQUEST",
    opts.question.trim(),
    "",
    "## RESOLVED FACTS",
  ];

  for (const st of opts.plan.subtasks) {
    const fact = opts.completion.facts.find((f) =>
      f.label.includes(st.label.slice(0, 12)),
    );
    if (fact?.value != null) {
      lines.push(`${st.id}: ${fact.value} ${fact.unit}`);
    }
  }

  if (opts.completion.calculatedBreakdown) {
    lines.push("", "## PER-ITEM BREAKDOWN", opts.completion.calculatedBreakdown);
  }
  if (opts.completion.calculatedTotal != null) {
    lines.push(
      "",
      "## CALCULATED RESULT",
      `total: ${Math.round(opts.completion.calculatedTotal)} calories`,
    );
  }

  lines.push(
    "",
    "## RESPONSE CONTRACT",
    "Phrase the answer naturally. Do not infer missing values. Do not perform arithmetic — use CALCULATED RESULT only. Do not cite sources inline.",
  );

  return lines.join("\n");
}

export function subtaskPreRunTasks(
  plan: ResearchTurnPlan,
  buildArgs: (subtask: ResearchSubtask) => Record<string, unknown>,
): Array<{
  name: string;
  arguments: Record<string, unknown>;
  reason: string;
  subtaskId: string;
}> {
  return plan.subtasks.map((st) => ({
    name: "web.search",
    arguments: buildArgs(st),
    reason: `subtask:${st.id}`,
    subtaskId: st.id,
  }));
}
