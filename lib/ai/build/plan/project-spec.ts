/**
 * Build ProjectSpec from guided website_setup_brief answers (chat model).
 */

import type { AgentTurnOptions } from "@/lib/ai/runtime/agent-turn";
import { runRawOpenAITurn } from "@/lib/ai/raw-openai/run-turn";
import type { AiGenerateRequest } from "@/lib/ai/runtime/types";
import type { WebsiteSetupBrief } from "@/lib/ai/build/website-setup-brief";
import type { ProjectSpec } from "@/lib/ai/build/plan/types";
import { normalizeProjectSpec } from "@/lib/ai/build/plan/normalize";
import { projectSpecFromBriefHeuristic } from "@/lib/ai/build/plan/heuristics";

export { projectSpecFromBriefHeuristic };

function answersBlob(brief: WebsiteSetupBrief | null | undefined): string {
  const answers = brief?.answers ?? {};
  try {
    return JSON.stringify(answers, null, 2).slice(0, 12_000);
  } catch {
    return String(answers);
  }
}

const SPEC_SYSTEM = `You are Cander's product planner. Return ONLY compact JSON for a ProjectSpec (no markdown fences).
kind must be "site". Include businessName, intent, goals[], ctas[{label,href,primary}], audience, industry, tone, location, phone, email when known.
Do not invent fake phone numbers. Prefer /contact for primary CTA href.`;

/**
 * Chat-model ProjectSpec from guided brief + user message. Falls back to heuristic.
 */
export async function buildProjectSpecFromBrief(
  request: AiGenerateRequest,
  brief: WebsiteSetupBrief | null | undefined,
  opts?: AgentTurnOptions,
): Promise<ProjectSpec> {
  const fallback = projectSpecFromBriefHeuristic(brief, request.content);
  try {
    const generated = await runRawOpenAITurn(
      {
        ...request,
        allowTools: false,
        toolContext: undefined,
        modelMode: "chat",
        content: [
          SPEC_SYSTEM,
          "",
          "JSON shape:",
          '{"version":1,"kind":"site","businessName","tagline","industry","intent","audience","goals":[],"ctas":[{"label","href","primary"}],"constraints":[],"tone","location","phone","email"}',
          "",
          "Guided answers:",
          answersBlob(brief),
          "",
          "User message:",
          request.content,
        ].join("\n"),
      },
      opts,
    );
    const text = generated.content || "";
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const parsed = JSON.parse(text.slice(start, end + 1));
      const normalized = normalizeProjectSpec(parsed);
      if (normalized) return normalized;
    }
  } catch (err) {
    console.warn("[cander:plan] buildProjectSpecFromBrief fell back", err);
  }
  return fallback;
}
