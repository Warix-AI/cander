/**
 * Generate private BuildPlan (markdown + JSON) from ProjectSpec via chat model.
 */

import type { AgentTurnOptions } from "@/lib/ai/runtime/agent-turn";
import { runRawOpenAITurn } from "@/lib/ai/raw-openai/run-turn";
import type { AiGenerateRequest } from "@/lib/ai/runtime/types";
import type { BuildPlanRecord, ProjectSpec } from "@/lib/ai/build/plan/types";
import {
  assertNavCoveredBySitemap,
  normalizeBuildPlanJson,
} from "@/lib/ai/build/plan/normalize";
import { renderBuildPlanMarkdown } from "@/lib/ai/build/plan/markdown";
import {
  buildPlanFromSpecHeuristic,
  ensureNavRoutes,
} from "@/lib/ai/build/plan/heuristics";

export { buildPlanFromSpecHeuristic };

const PLAN_SYSTEM = `You are Cander's website architect. Return ONLY compact JSON for BuildPlanJson (no markdown fences).
Rules:
- kind is "site"
- sitemap + pages must cover every nav.href (internal paths)
- componentNeeds[].role must be UI roles (hero, services, faq, testimonials, cta, form, features, gallery) — NEVER business nouns alone
- componentNeeds[].designIntent describes visual/marketing intent (e.g. "warm local landscaping marketing"), NEVER a single keyword like "tree"
- Prefer 3–6 componentNeeds
- Include validationChecklist[]`;

/**
 * Chat-model BuildPlan from ProjectSpec. Markdown is derived from JSON (DB-only).
 */
export async function generateBuildPlan(
  request: AiGenerateRequest,
  spec: ProjectSpec,
  opts?: AgentTurnOptions,
): Promise<BuildPlanRecord> {
  const fallback = buildPlanFromSpecHeuristic(spec);
  let json = fallback.json;
  try {
    const generated = await runRawOpenAITurn(
      {
        ...request,
        allowTools: false,
        toolContext: undefined,
        modelMode: "chat",
        content: [
          PLAN_SYSTEM,
          "",
          "ProjectSpec:",
          JSON.stringify(spec).slice(0, 8000),
          "",
          "JSON shape:",
          '{"version":1,"kind":"site","sitemap":[{"id","path","title"}],"pages":[{"id","path","title","sections":[{"id","role","title","purpose"}]}],"nav":[{"label","href"}],"ctaStrategy":{"primary":{"label","href"}},"designSystem":{"layoutStyle","colorMood","notes"},"componentNeeds":[{"role","designIntent","pageId","sectionId","required"}],"validationChecklist":[]}',
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
      const normalized = normalizeBuildPlanJson(parsed);
      if (normalized) {
        json = ensureNavRoutes(normalized);
      }
    }
  } catch (err) {
    console.warn("[cander:plan] generateBuildPlan fell back", err);
  }

  let issues = assertNavCoveredBySitemap(json);
  if (issues.length) {
    json = ensureNavRoutes(json);
    issues = assertNavCoveredBySitemap(json);
  }
  if (issues.length) {
    console.warn("[cander:plan] nav still uncovered after repair", issues);
  }

  return {
    version: 1,
    markdown: renderBuildPlanMarkdown(json),
    json,
    updatedAt: new Date().toISOString(),
  };
}
