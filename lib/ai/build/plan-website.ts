/**
 * planWebsite — chat-model SiteSpec for Build create (low cost).
 */

import type { AgentTurnOptions } from "@/lib/ai/runtime/agent-turn";
import { runRawOpenAITurn } from "@/lib/ai/raw-openai/run-turn";
import type { AiGenerateRequest } from "@/lib/ai/runtime/types";
import { catalogPromptBlock } from "@/lib/ai/build/design-system/catalog";
import {
  defaultSiteSpec,
  normalizeSiteSpec,
  type SiteSpec,
} from "@/lib/ai/build/site-spec";

const PLAN_SYSTEM = `You are Cander's website planner. Return ONLY compact JSON for a SiteSpec (no markdown fences).
Compose a production-quality marketing site from the Cander catalog — pick variants so different businesses look different.
Do not invent variant ids outside the catalog.
Keep customGaps empty unless the user clearly needs auth, payments, databases, native apps, or other non-catalog work.`;

export async function planWebsite(
  request: AiGenerateRequest,
  opts?: AgentTurnOptions,
): Promise<SiteSpec> {
  const fallback = defaultSiteSpec(request.content);
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
          catalogPromptBlock(),
          "",
          "JSON shape:",
          "{",
          '  "businessName", "tagline", "industry", "intent", "phone", "email", "location",',
          '  "ctaPrimary": { "label", "href" }, "ctaSecondary": { "label", "href" },',
          '  "nav": [{ "label", "href" }], "headerVariant", "footerVariant",',
          '  "theme": { "layoutStyle", "primary", "background", "foreground", "accent", "spacingScale" },',
          '  "pages": [{ "id", "path", "title", "description", "sections": [{ "id", "kind", "variant", "eyebrow", "title", "body", "items": [{ "title", "body", "meta" }], "ctaLabel", "ctaHref", "imageSlot" }] }],',
          '  "customGaps": []',
          "}",
          "",
          "First home section must be the hero: set imageSlot to hero-<heroVariantId>.",
          "User request:",
          request.content,
        ].join("\n"),
      },
      { ...opts, suppressContentDelta: true },
    );
    const raw = (generated.content || "").trim();
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return fallback;
    const parsed = JSON.parse(raw.slice(start, end + 1)) as unknown;
    return normalizeSiteSpec(parsed, request.content);
  } catch {
    return fallback;
  }
}
