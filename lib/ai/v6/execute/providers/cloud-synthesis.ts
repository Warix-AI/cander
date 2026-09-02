/**
 * OpenAI synthesis for V6 tests / legacy callers.
 * Production chat uses runRawOpenAITurn directly (agent-turn.ts).
 */

import type { AiGenerateRequest } from "@/lib/ai/runtime/types";
import type { AnswerBundle } from "../../types.ts";

export type CloudSynthesisResult = {
  content: string;
  runtime: "cloud";
  citations?: Array<{ id: string; title: string; url: string }>;
};

export async function cloudSynthesis(args: {
  request: AiGenerateRequest;
  bundle: AnswerBundle;
  synthesisPrompt: string;
  invoke?: (req: AiGenerateRequest) => Promise<CloudSynthesisResult>;
}): Promise<CloudSynthesisResult> {
  if (args.invoke) {
    return args.invoke({
      ...args.request,
      content: args.synthesisPrompt,
    });
  }

  try {
    const { completeWithOpenAI } = await import(
      "@/lib/ai/openai/complete-client"
    );
    const text = await completeWithOpenAI({
      prompt: args.synthesisPrompt,
    });
    return {
      content: text || "I couldn't complete this request.",
      runtime: "cloud",
      citations: args.bundle.evidence
        .filter((e) => e.source?.url)
        .map((e, i) => ({
          id: e.id || `c${i}`,
          title: e.source?.title || "Source",
          url: e.source?.url || "",
        })),
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "openai_synthesis_failed";
    return {
      content: `Cloud synthesis unavailable: ${message}`,
      runtime: "cloud",
    };
  }
}

export function needsCloudSynthesis(args: {
  hasImages?: boolean;
  hasResearch?: boolean;
  fmUnavailable?: boolean;
  detailDeep?: boolean;
}): boolean {
  return Boolean(
    args.hasImages ||
      args.hasResearch ||
      args.fmUnavailable ||
      args.detailDeep,
  );
}
