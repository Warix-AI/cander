/**
 * Edge V2 as synthesis provider only — not a separate orchestrator.
 */

import type { AiGenerateRequest } from "@/lib/ai/runtime/types";
import type { AnswerBundle } from "../../types.ts";

export type CloudSynthesisResult = {
  content: string;
  runtime: "cloud";
  citations?: Array<{ id: string; title: string; url: string }>;
};

/**
 * Call Edge for vision / deep research / complex synthesis when V6 selects cloud renderer.
 * Injectable for tests; live path dynamically imports runOrchestratedTurn.
 */
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

  // Vision or unavailable FM → Edge orchestrator as provider
  try {
    const { runOrchestratedTurn } = await import(
      "@/lib/ai/orchestrator/run-turn"
    );
    const result = await runOrchestratedTurn({
      ...args.request,
      content: args.synthesisPrompt,
      allowTools: false,
    });
    return {
      content: result.content,
      runtime: "cloud",
      citations: result.citations?.map((c, i) => ({
        id: c.id || `c${i}`,
        title: c.title || "Source",
        url: c.url,
      })),
    };
  } catch (e) {
    return {
      content:
        e instanceof Error
          ? `Cloud synthesis unavailable: ${e.message}`
          : "Cloud synthesis unavailable.",
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
