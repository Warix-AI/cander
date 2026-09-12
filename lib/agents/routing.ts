/**
 * Expert selection for Cander — uses Name + Description + Status only.
 * Never loads or returns Instructions.
 */

import OpenAI from "openai";
import { resolveOpenAIModel } from "@/lib/ai/raw-openai/web-search";
import {
  formatExpertDirectoryForPrompt,
  listExpertDirectory,
  scoreExpertDirectory,
  type ExpertDirectoryEntry,
} from "@/lib/agents/directory";
import { runAgent, type RunAgentResult } from "@/lib/agents/runtime";

export type ExpertSelection =
  | { expert: ExpertDirectoryEntry; reason: string }
  | { expert: null; reason: string };

/**
 * Pick the best Expert for a situation from the lightweight directory.
 * Returns null when no Expert is relevant (Cander may handle alone).
 */
export async function selectExpertForSituation(opts: {
  workspaceId: string;
  situation: string;
  projectId?: string | null;
}): Promise<ExpertSelection> {
  const situation = opts.situation.trim();
  if (!situation) {
    return { expert: null, reason: "Empty situation." };
  }

  const entries = await listExpertDirectory({
    workspaceId: opts.workspaceId,
    projectId: opts.projectId,
    includeDraft: false,
  });
  if (!entries.length) {
    return { expert: null, reason: "No active Experts in the directory." };
  }

  const scored = scoreExpertDirectory(entries, situation);
  if (!scored.length) {
    return {
      expert: null,
      reason:
        "No Expert clearly matches this situation; Cander can handle it without consulting.",
    };
  }

  const top = scored[0]!;
  const second = scored[1];

  // Single keyword match → consult immediately (no LLM).
  if (scored.length === 1) {
    return {
      expert: top.entry,
      reason: `Matched ${top.entry.name} from directory descriptions.`,
    };
  }

  // Situation literally names the top Expert.
  if (situation.toLowerCase().includes(top.entry.name.toLowerCase())) {
    return {
      expert: top.entry,
      reason: `Situation mentions ${top.entry.name}.`,
    };
  }

  // Clear keyword leader (e.g. Rescheduling vs generic Gmail assistant).
  if (!second || top.score >= second.score + 2) {
    return {
      expert: top.entry,
      reason: `Best directory match: ${top.entry.name}.`,
    };
  }

  // Close scores → ask LLM; if it abstains, still use the keyword leader so
  // clearly relevant mail (reschedule, etc.) is not silently dropped.
  const picked = await pickExpertWithLlm({
    candidates: scored.map((row) => row.entry),
    situation,
  });
  if (picked) {
    const expert = scored.find((row) => row.entry.id === picked)?.entry ?? null;
    if (expert) {
      return {
        expert,
        reason: `Selected ${expert.name} from Expert directory descriptions.`,
      };
    }
  }

  return {
    expert: top.entry,
    reason: `Fallback to best directory match: ${top.entry.name}.`,
  };
}

async function pickExpertWithLlm(opts: {
  candidates: ExpertDirectoryEntry[];
  situation: string;
}): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    // Without LLM, only return a keyword match — never force the first Expert.
    return null;
  }

  try {
    const openai = new OpenAI({ apiKey });
    const model = resolveOpenAIModel();
    const res = await openai.chat.completions.create({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You route situations to Experts using ONLY the directory below (name + description + status).
You never invent Experts. You never need Instructions — they are private.
If no Expert is a clear fit, return {"expertId":null}.
If one fits, return {"expertId":"<id>"}.
Do not force a match.`,
        },
        {
          role: "user",
          content: [
            "Expert directory:",
            formatExpertDirectoryForPrompt(opts.candidates),
            "",
            "Situation:",
            opts.situation,
          ].join("\n"),
        },
      ],
    });
    const text = res.choices[0]?.message?.content?.trim() || "{}";
    const parsed = JSON.parse(text) as { expertId?: unknown };
    const id =
      typeof parsed.expertId === "string" ? parsed.expertId.trim() : "";
    if (!id || id === "null") return null;
    return opts.candidates.some((e) => e.id === id) ? id : null;
  } catch {
    return null;
  }
}

/** Consult a specific Expert — Cander presents the situation; Expert decides. */
export async function consultExpert(opts: {
  agentId: string;
  workspaceId: string;
  projectId: string;
  profileId: string;
  situation: string;
  triggerType?: "consult" | "event";
  idempotencyKey?: string;
  triggerPayload?: Record<string, unknown>;
}): Promise<RunAgentResult> {
  return runAgent({
    agentId: opts.agentId,
    workspaceId: opts.workspaceId,
    projectId: opts.projectId,
    profileId: opts.profileId,
    triggerType: opts.triggerType ?? "consult",
    consultSituation: opts.situation,
    idempotencyKey: opts.idempotencyKey,
    triggerPayload: opts.triggerPayload,
  });
}

/**
 * Route a connector/sync event: directory lookup → optional consult.
 * Does not force an Expert when none match.
 */
export async function routeEventToExpert(opts: {
  workspaceId: string;
  profileId: string;
  situation: string;
  projectId?: string | null;
  connectionId?: string;
  idempotencyKey?: string;
  triggerPayload?: Record<string, unknown>;
  /** Rewrite the Cander opening after Expert selection (e.g. "Hey Booking, …"). */
  formatSituationForExpert?: (expertName: string) => string;
}): Promise<
  | { consulted: false; reason: string }
  | {
      consulted: true;
      expert: ExpertDirectoryEntry;
      reason: string;
      result: RunAgentResult;
    }
> {
  const selection = await selectExpertForSituation({
    workspaceId: opts.workspaceId,
    situation: opts.situation,
    projectId: opts.projectId,
  });
  if (!selection.expert) {
    return { consulted: false, reason: selection.reason };
  }

  const situation =
    opts.formatSituationForExpert?.(selection.expert.name) ?? opts.situation;

  const result = await consultExpert({
    agentId: selection.expert.id,
    workspaceId: opts.workspaceId,
    projectId: selection.expert.projectId,
    profileId: opts.profileId,
    situation,
    triggerType: "event",
    idempotencyKey: opts.idempotencyKey,
    triggerPayload: {
      ...(opts.triggerPayload ?? {}),
      ...(opts.connectionId ? { connectionId: opts.connectionId } : {}),
      routedExpertId: selection.expert.id,
      routeReason: selection.reason,
    },
  });

  return {
    consulted: true,
    expert: selection.expert,
    reason: selection.reason,
    result,
  };
}
