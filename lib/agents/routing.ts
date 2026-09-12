/**
 * Expert selection for Cander — uses Name + Description + Status only.
 * Never loads or returns Instructions.
 */

import OpenAI from "openai";
import { resolveOpenAIModel } from "@/lib/ai/openai-model";
import {
  formatExpertDirectoryForPrompt,
  listExpertDirectory,
  searchExpertDirectory,
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

  const ranked = searchExpertDirectory(entries, situation, 5);
  if (ranked.length === 1) {
    return {
      expert: ranked[0]!,
      reason: `Matched ${ranked[0]!.name} from directory descriptions.`,
    };
  }
  if (
    ranked.length >= 2 &&
    ranked[0] &&
    // Strong name mention wins without LLM.
    situation.toLowerCase().includes(ranked[0].name.toLowerCase())
  ) {
    return {
      expert: ranked[0],
      reason: `Situation mentions ${ranked[0].name}.`,
    };
  }

  const candidates = ranked.length ? ranked : entries;
  const picked = await pickExpertWithLlm({
    candidates,
    situation,
  });
  if (!picked) {
    return {
      expert: null,
      reason:
        "No Expert clearly matches this situation; Cander can handle it without consulting.",
    };
  }
  const expert = candidates.find((e) => e.id === picked) ?? null;
  if (!expert) {
    return { expert: null, reason: "Selected Expert id was not in directory." };
  }
  return {
    expert,
    reason: `Selected ${expert.name} from Expert directory descriptions.`,
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
  triggerPayload?: Record<string, unknown>;
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

  const result = await consultExpert({
    agentId: selection.expert.id,
    workspaceId: opts.workspaceId,
    projectId: selection.expert.projectId,
    profileId: opts.profileId,
    situation: opts.situation,
    triggerType: "event",
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
