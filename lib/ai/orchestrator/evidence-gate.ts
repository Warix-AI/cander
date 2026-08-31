/**
 * Evidence Gate — relevance filter, injection screen, quality check (v4 §4 + §10 step 8).
 * Retrieved content is untrusted data; quarantined items never reach FM synthesis.
 */

import type { TurnEvidence } from "./evidence.ts";
import type { TurnTaskResolution } from "@/lib/ai/turn-environment/turn-task.ts";
import type { ConversationTurnState } from "@/lib/ai/turn-environment/conversation-types.ts";
import type { TurnRelation } from "@/lib/ai/turn-environment/turn-relation.ts";
import { filterEvidenceForCurrentTurn } from "./evidence-hygiene.ts";
import {
  evaluateResearchQuality,
  type EvidenceSnippet,
} from "./research-quality.ts";

export type EvidenceGateAction = "inject" | "quarantine" | "reject";

export type EvidenceGateRecord = {
  id: string;
  action: EvidenceGateAction;
  reason: string;
  kind?: string;
  subtaskId?: string;
};

export type EvidenceGateResult = {
  evidence: TurnEvidence[];
  records: EvidenceGateRecord[];
  injectCount: number;
  quarantineCount: number;
  rejectCount: number;
  qualitySufficient: boolean;
  needsRetry: boolean;
  blocked: boolean;
  blockReason?: string;
};

/** Imperative patterns in retrieved content that may be prompt injection (v4 §4.5). */
const INJECTION_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /\bignore (all )?(previous|prior) instructions\b/i, reason: "ignore_instructions" },
  { re: /\bdisregard (your|the) (system|safety)\b/i, reason: "disregard_system" },
  { re: /\byou must (now )?(send|delete|deploy|email|schedule)\b/i, reason: "imperative_to_model" },
  { re: /\b(system prompt|developer message|hidden instruction)\b/i, reason: "meta_instruction" },
];

function looksLikeInjection(content: string): string | null {
  for (const { re, reason } of INJECTION_PATTERNS) {
    if (re.test(content)) return reason;
  }
  return null;
}

function evidenceAsSnippets(items: TurnEvidence[]): EvidenceSnippet[] {
  return items
    .filter((e) => e.ok && e.content.trim())
    .map((e) => ({
      id: e.id,
      title: e.title,
      url: e.url,
      content: e.content,
      kind: e.kind,
    }));
}

export function runEvidenceGate(opts: {
  evidence: TurnEvidence[];
  question: string;
  turnTask: TurnTaskResolution;
  conversationState?: ConversationTurnState | null;
  turnRelation?: TurnRelation;
  deeper?: boolean;
  requireQuality?: boolean;
}): EvidenceGateResult {
  const records: EvidenceGateRecord[] = [];
  const original = [...opts.evidence];

  const { evidence: filtered, dropped } = filterEvidenceForCurrentTurn(
    opts.evidence,
    {
      turnTask: opts.turnTask,
      conversationState: opts.conversationState,
      userMessage: opts.question,
      turnRelation: opts.turnRelation,
    },
  );

  const keptIds = new Set(filtered.map((e) => e.id));
  for (const e of original) {
    if (!keptIds.has(e.id)) {
      records.push({
        id: e.id,
        action: "reject",
        reason:
          opts.turnRelation === "topic_switch" ? "topic_switch" : "cross_topic",
        kind: e.kind,
        subtaskId: e.subtaskId,
      });
    }
  }

  const afterHygiene = [...filtered];
  const injectable: TurnEvidence[] = [];

  for (const e of afterHygiene) {
    const blob = `${e.title}\n${e.content}`;
    const injection = looksLikeInjection(blob);
    if (injection) {
      records.push({
        id: e.id,
        action: "quarantine",
        reason: injection,
        kind: e.kind,
        subtaskId: e.subtaskId,
      });
      continue;
    }
    records.push({
      id: e.id,
      action: "inject",
      reason: "accepted",
      kind: e.kind,
      subtaskId: e.subtaskId,
    });
    injectable.push(e);
  }

  opts.evidence.splice(0, opts.evidence.length, ...injectable);

  const gate = evaluateResearchQuality({
    question: opts.question,
    evidence: evidenceAsSnippets(injectable),
    deeper: opts.deeper ?? false,
  });

  const needsRetry =
    gate.needsMoreInvestigation && !gate.evidenceSufficient && injectable.length > 0;

  let blocked = false;
  let blockReason: string | undefined;
  if (
    opts.requireQuality &&
    injectable.length === 0 &&
    gate.needsMoreInvestigation
  ) {
    blocked = true;
    blockReason = "no_usable_evidence";
  }

  return {
    evidence: injectable,
    records,
    injectCount: records.filter((r) => r.action === "inject").length,
    quarantineCount: records.filter((r) => r.action === "quarantine").length,
    rejectCount: records.filter((r) => r.action === "reject").length + dropped,
    qualitySufficient: gate.evidenceSufficient,
    needsRetry,
    blocked,
    blockReason,
  };
}
