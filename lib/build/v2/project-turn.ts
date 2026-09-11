/**
 * Chat entry for V2 config sites — no sandbox coding agent.
 */

import type {
  AgentTurnOptions,
  AgentTurnResult,
} from "@/lib/ai/runtime/agent-turn";
import type { AiGenerateRequest } from "@/lib/ai/runtime/types";
import { extractBrandAndClassify } from "./classify.ts";
import {
  getStarterBlueprint,
  hydrateConfigWithBrand,
  initializeProjectConfigFromBlueprint,
} from "./init.ts";
import { applyV2Mutations } from "./mutations.ts";
import { loadV2ProjectConfig, saveV2ProjectConfig } from "./store.ts";
import type { V2Mutation } from "./types.ts";

export async function getProjectBuilderVersion(
  projectId: string,
): Promise<"v1" | "v2_config"> {
  try {
    if (typeof window === "undefined") {
      const loaded = await loadV2ProjectConfig(projectId);
      if (loaded?.builderVersion === "v2_config") return "v2_config";
      return "v1";
    }
    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/builder-v2/mutate`,
    );
    if (!res.ok) return "v1";
    const json = (await res.json()) as { builderVersion?: string };
    return json.builderVersion === "v2_config" ? "v2_config" : "v1";
  } catch {
    return "v1";
  }
}

export async function runBuilderV2ConfigTurn(
  request: AiGenerateRequest,
  opts: AgentTurnOptions | undefined,
  ctx: { projectId: string; workspaceId: string },
): Promise<AgentTurnResult> {
  const report = opts?.onProgress ?? (() => {});
  report({ phase: "thinking", label: "Updating site", detail: "Applying configuration…" });

  const loaded = await loadV2ProjectConfig(ctx.projectId);
  const text = String(request.content || "").trim();

  // First-time init when no config yet (flag-gated create path may call init API separately).
  if (!loaded?.config) {
    if (typeof window !== "undefined") {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(ctx.projectId)}/builder-v2/init`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId: ctx.workspaceId,
            description: text,
          }),
        },
      );
      const json = await res.json();
      if (!res.ok) {
        return {
          content: json.error || "Could not initialize the site configuration.",
          runtime: "cloud",
          offline: false,
          condensationOccurred: false,
          aiChatId: request.aiChatId ?? null,
        };
      }
      window.dispatchEvent(
        new CustomEvent("cander:builder-v2-refresh", {
          detail: { projectId: ctx.projectId },
        }),
      );
      const questions = (json.followUpQuestions as string[]) || [];
      return {
        content: [
          `I set up **${json.config?.brand?.businessName || "your site"}** using the **${json.blueprintName}** blueprint.`,
          json.rationale,
          questions.length
            ? `\nA few things would make it stronger:\n${questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}`
            : "\nTell me what you’d like to change — headline, colors, pages, sections — and I’ll update the configuration.",
        ].join("\n"),
        runtime: "cloud",
        offline: false,
        condensationOccurred: false,
        aiChatId: request.aiChatId ?? null,
      };
    }

    // Server path
    const extracted = extractBrandAndClassify(text);
    const blueprint = getStarterBlueprint(extracted.blueprintId);
    if (!blueprint) {
      return {
        content: "I couldn’t find a matching blueprint.",
        runtime: "cloud",
        offline: false,
        condensationOccurred: false,
        aiChatId: request.aiChatId ?? null,
      };
    }
    let config = initializeProjectConfigFromBlueprint({
      blueprint,
      brand: extracted.brand,
      businessDescription: text,
    });
    config = hydrateConfigWithBrand(config);
    await saveV2ProjectConfig({
      projectId: ctx.projectId,
      workspaceId: ctx.workspaceId,
      config,
      summary: `Initialized ${blueprint.id}`,
    });
    return {
      content: `Configured from **${blueprint.name}**. ${extracted.followUpQuestions[0] || "What should we refine next?"}`,
      runtime: "cloud",
      offline: false,
      condensationOccurred: false,
      aiChatId: request.aiChatId ?? null,
    };
  }

  const mutations = inferMutationsFromText(text, loaded.config);
  if (!mutations.length) {
    return {
      content:
        "I can update copy, reorder sections, switch allowed variants, or adjust theme tokens. Try: “Make the hero headline shorter” or “Move testimonials above the gallery.”",
      runtime: "cloud",
      offline: false,
      condensationOccurred: false,
      aiChatId: request.aiChatId ?? null,
    };
  }

  if (typeof window !== "undefined") {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(ctx.projectId)}/builder-v2/mutate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: ctx.workspaceId, mutations }),
      },
    );
    const json = await res.json();
    if (!res.ok) {
      return {
        content: `That change wasn’t valid: ${json.error || res.status}`,
        runtime: "cloud",
        offline: false,
        condensationOccurred: false,
        aiChatId: request.aiChatId ?? null,
      };
    }
    window.dispatchEvent(
      new CustomEvent("cander:builder-v2-refresh", {
        detail: { projectId: ctx.projectId },
      }),
    );
    return {
      content: `Done — ${json.summary}. The preview should update immediately.`,
      runtime: "cloud",
      offline: false,
      condensationOccurred: false,
      aiChatId: request.aiChatId ?? null,
    };
  }

  const result = applyV2Mutations(loaded.config, mutations);
  if (!result.ok) {
    return {
      content: `That change wasn’t valid: ${result.error}`,
      runtime: "cloud",
      offline: false,
      condensationOccurred: false,
      aiChatId: request.aiChatId ?? null,
    };
  }
  await saveV2ProjectConfig({
    projectId: ctx.projectId,
    workspaceId: ctx.workspaceId,
    config: result.config,
    summary: result.summary,
  });
  return {
    content: `Done — ${result.summary}.`,
    runtime: "cloud",
    offline: false,
    condensationOccurred: false,
    aiChatId: request.aiChatId ?? null,
  };
}

/** Small deterministic NL → mutation helpers for the V2 foundation. */
function inferMutationsFromText(
  text: string,
  config: import("./types").V2ProjectConfig,
): V2Mutation[] {
  const mutations: V2Mutation[] = [];
  const headline = text.match(
    /(?:hero\s+)?headline\s+(?:to|should be|is)\s+[“"]?([^”"]+)[”"]?/i,
  );
  if (headline) {
    const hero = config.pages[0]?.sections.find((s) => s.componentType === "hero");
    if (hero) {
      mutations.push({
        op: "update_component_content",
        pageId: config.pages[0].id,
        sectionId: hero.id,
        content: { headline: headline[1].trim() },
      });
    }
  }

  const cta = text.match(
    /(?:button|cta)\s+(?:to|should say|says)\s+[“"]?([^”"]+)[”"]?/i,
  );
  if (cta) {
    const hero = config.pages[0]?.sections.find((s) => s.componentType === "hero");
    if (hero) {
      mutations.push({
        op: "update_component_content",
        pageId: config.pages[0].id,
        sectionId: hero.id,
        content: { primary_cta_label: cta[1].trim() },
      });
    }
  }

  const moreMinimal = /more minimal|feel more minimal|less busy/i.test(text);
  if (moreMinimal) {
    mutations.push({
      op: "update_theme",
      themePresetId: "clean_minimal",
      patch: { density: "airy", shadow: "none", radius: "0.25rem" },
    });
    mutations.push({
      op: "update_behavior",
      behaviorPresetId: "minimal_motion",
      patch: { motion: "off", hoverScale: false },
    });
  }

  const reorder = text.match(/move\s+(\w+)\s+above\s+(?:the\s+)?(\w+)/i);
  if (reorder) {
    const page = config.pages[0];
    if (page) {
      const a = page.sections.findIndex((s) =>
        s.componentType.includes(reorder[1].toLowerCase()) ||
        s.id.includes(reorder[1].toLowerCase()),
      );
      const b = page.sections.findIndex((s) =>
        s.componentType.includes(reorder[2].toLowerCase()) ||
        s.id.includes(reorder[2].toLowerCase()),
      );
      if (a >= 0 && b >= 0 && a !== b) {
        const ids = page.sections.map((s) => s.id);
        const [moved] = ids.splice(a, 1);
        const insertAt = ids.indexOf(page.sections[b].id);
        ids.splice(insertAt, 0, moved);
        mutations.push({ op: "reorder_section", pageId: page.id, sectionIds: ids });
      }
    }
  }

  return mutations;
}
