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

  const { isFoundationModelsEnabled } = await import(
    "../../../runtime/native/fm-policy.ts"
  );
  const useOpenAI = !isFoundationModelsEnabled();

  // #region agent log
  fetch("http://127.0.0.1:7521/ingest/0b7940f7-640a-4835-98e0-f86faa434abe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "20f195",
    },
    body: JSON.stringify({
      sessionId: "20f195",
      runId: "post-fix",
      hypothesisId: "H1",
      location: "cloud-synthesis.ts:entry",
      message: "cloud synthesis backend",
      data: {
        useOpenAI,
        promptLen: args.synthesisPrompt.length,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  if (useOpenAI) {
    try {
      const { completeWithOpenAI } = await import(
        "@/lib/ai/openai/complete-client"
      );
      const text = await completeWithOpenAI({
        prompt: args.synthesisPrompt,
      });
      // #region agent log
      fetch(
        "http://127.0.0.1:7521/ingest/0b7940f7-640a-4835-98e0-f86faa434abe",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Session-Id": "20f195",
          },
          body: JSON.stringify({
            sessionId: "20f195",
            runId: "post-fix",
            hypothesisId: "H1",
            location: "cloud-synthesis.ts:openai-ok",
            message: "openai synthesis ok",
            data: { textLen: text.length, preview: text.slice(0, 120) },
            timestamp: Date.now(),
          }),
        },
      ).catch(() => {});
      // #endregion
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
      // #region agent log
      fetch(
        "http://127.0.0.1:7521/ingest/0b7940f7-640a-4835-98e0-f86faa434abe",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Session-Id": "20f195",
          },
          body: JSON.stringify({
            sessionId: "20f195",
            runId: "post-fix",
            hypothesisId: "H1_H5",
            location: "cloud-synthesis.ts:openai-fail",
            message: "openai synthesis failed",
            data: { error: message.slice(0, 300) },
            timestamp: Date.now(),
          }),
        },
      ).catch(() => {});
      // #endregion
      return {
        content: `Cloud synthesis unavailable: ${message}`,
        runtime: "cloud",
      };
    }
  }

  // FM enabled — legacy Edge orchestrator (Ollama bridge) path
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
    const message = e instanceof Error ? e.message : "orchestrator_failed";
    // #region agent log
    fetch("http://127.0.0.1:7521/ingest/0b7940f7-640a-4835-98e0-f86faa434abe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "20f195",
      },
      body: JSON.stringify({
        sessionId: "20f195",
        runId: "post-fix",
        hypothesisId: "H1",
        location: "cloud-synthesis.ts:orchestrator-fail",
        message: "edge orchestrator synthesis failed",
        data: { error: message.slice(0, 300) },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
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
