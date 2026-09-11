import { getVariantContract, listVariantsForType, validateContentAgainstSchema } from "./registry.ts";
import { applyBrandColorsToTheme } from "./presets.ts";
import type { V2Mutation, V2ProjectConfig, V2SectionInstance } from "./types.ts";

export type MutationResult =
  | { ok: true; config: V2ProjectConfig; summary: string }
  | { ok: false; error: string };

function findPage(config: V2ProjectConfig, pageId: string) {
  return config.pages.find((p) => p.id === pageId);
}

function findSection(config: V2ProjectConfig, pageId: string, sectionId: string) {
  const page = findPage(config, pageId);
  if (!page) return { page: null, section: null };
  return { page, section: page.sections.find((s) => s.id === sectionId) || null };
}

/**
 * Validate + apply a single structured mutation.
 * Never partially applies invalid ops.
 */
export function applyV2Mutation(config: V2ProjectConfig, mutation: V2Mutation): MutationResult {
  const next: V2ProjectConfig = structuredClone(config);

  switch (mutation.op) {
    case "update_brand": {
      next.brand = { ...next.brand, ...mutation.patch };
      next.theme = applyBrandColorsToTheme(next.theme, next.brand);
      break;
    }
    case "update_theme": {
      next.theme = { ...next.theme, ...mutation.patch };
      if (mutation.themePresetId) next.themePresetId = mutation.themePresetId;
      break;
    }
    case "update_behavior": {
      next.behavior = { ...next.behavior, ...mutation.patch };
      if (mutation.behaviorPresetId) next.behaviorPresetId = mutation.behaviorPresetId;
      break;
    }
    case "update_global_component": {
      const target = mutation.target === "header" ? next.header : next.footer;
      if (mutation.variantId) {
        const v = getVariantContract(mutation.variantId);
        if (!v || v.typeId !== mutation.target) {
          return { ok: false, error: `Invalid ${mutation.target} variant "${mutation.variantId}"` };
        }
        target.variantId = mutation.variantId;
      }
      if (mutation.content) {
        const check = validateContentAgainstSchema(target.variantId, {
          ...target.content,
          ...mutation.content,
        });
        if (!check.ok) return check;
        target.content = { ...target.content, ...mutation.content };
      }
      if (mutation.config) {
        target.config = { ...(target.config || {}), ...mutation.config };
      }
      break;
    }
    case "update_component_content": {
      const { section } = findSection(next, mutation.pageId, mutation.sectionId);
      if (!section) return { ok: false, error: "Page or section not found" };
      const merged = { ...section.content, ...mutation.content };
      const check = validateContentAgainstSchema(section.variantId, merged);
      if (!check.ok) return check;
      // Reject unknown keys already handled in validate; also reject inventing keys not in schema
      for (const key of Object.keys(mutation.content)) {
        const v = getVariantContract(section.variantId);
        if (v && !(key in v.contentSchema)) {
          return { ok: false, error: `Unsupported content field "${key}" for ${section.variantId}` };
        }
      }
      section.content = merged;
      break;
    }
    case "update_component_config": {
      const { section } = findSection(next, mutation.pageId, mutation.sectionId);
      if (!section) return { ok: false, error: "Page or section not found" };
      const v = getVariantContract(section.variantId);
      if (!v) return { ok: false, error: `Unknown variant ${section.variantId}` };
      for (const key of Object.keys(mutation.config)) {
        if (!(key in v.configSchema)) {
          return { ok: false, error: `Unsupported config field "${key}" for ${section.variantId}` };
        }
      }
      section.config = { ...(section.config || {}), ...mutation.config };
      break;
    }
    case "change_component_variant": {
      const { section } = findSection(next, mutation.pageId, mutation.sectionId);
      if (!section) return { ok: false, error: "Page or section not found" };
      const v = getVariantContract(mutation.variantId);
      if (!v) return { ok: false, error: `Unknown variant "${mutation.variantId}"` };
      if (v.typeId !== section.componentType) {
        return {
          ok: false,
          error: `Variant ${mutation.variantId} is type ${v.typeId}, section is ${section.componentType}`,
        };
      }
      const allowed = listVariantsForType(section.componentType).map((x) => x.id);
      if (!allowed.includes(mutation.variantId)) {
        return { ok: false, error: "Variant not allowed for this component type" };
      }
      section.variantId = mutation.variantId;
      break;
    }
    case "add_section": {
      const page = findPage(next, mutation.pageId);
      if (!page) return { ok: false, error: "Page not found" };
      const v = getVariantContract(mutation.section.variantId);
      if (!v) return { ok: false, error: `Unknown variant "${mutation.section.variantId}"` };
      if (v.typeId !== mutation.section.componentType) {
        return { ok: false, error: "componentType/variant mismatch" };
      }
      const check = validateContentAgainstSchema(mutation.section.variantId, mutation.section.content);
      if (!check.ok) return check;
      const section: V2SectionInstance = {
        ...mutation.section,
        id: mutation.section.id || `sec_${Math.random().toString(36).slice(2, 8)}`,
      };
      if (mutation.afterSectionId) {
        const idx = page.sections.findIndex((s) => s.id === mutation.afterSectionId);
        if (idx >= 0) page.sections.splice(idx + 1, 0, section);
        else page.sections.push(section);
      } else {
        page.sections.push(section);
      }
      break;
    }
    case "remove_section": {
      const page = findPage(next, mutation.pageId);
      if (!page) return { ok: false, error: "Page not found" };
      const before = page.sections.length;
      page.sections = page.sections.filter((s) => s.id !== mutation.sectionId);
      if (page.sections.length === before) return { ok: false, error: "Section not found" };
      break;
    }
    case "reorder_section": {
      const page = findPage(next, mutation.pageId);
      if (!page) return { ok: false, error: "Page not found" };
      const map = new Map(page.sections.map((s) => [s.id, s]));
      if (mutation.sectionIds.length !== page.sections.length) {
        return { ok: false, error: "sectionIds must include every section exactly once" };
      }
      const reordered: V2SectionInstance[] = [];
      for (const id of mutation.sectionIds) {
        const s = map.get(id);
        if (!s) return { ok: false, error: `Unknown section id ${id}` };
        reordered.push(s);
      }
      page.sections = reordered;
      break;
    }
    case "add_page": {
      if (next.pages.some((p) => p.id === mutation.page.id || p.path === mutation.page.path)) {
        return { ok: false, error: "Page id or path already exists" };
      }
      for (const s of mutation.page.sections) {
        const check = validateContentAgainstSchema(s.variantId, s.content);
        if (!check.ok) return check;
      }
      next.pages.push(mutation.page);
      break;
    }
    case "update_page": {
      const page = findPage(next, mutation.pageId);
      if (!page) return { ok: false, error: "Page not found" };
      if (mutation.patch.title !== undefined) page.title = mutation.patch.title;
      if (mutation.patch.path !== undefined) page.path = mutation.patch.path;
      if (mutation.patch.seo) page.seo = { ...(page.seo || {}), ...mutation.patch.seo };
      break;
    }
    case "remove_page": {
      if (mutation.pageId === "home" || next.pages.find((p) => p.id === mutation.pageId)?.path === "/") {
        return { ok: false, error: "Cannot remove the home page" };
      }
      const before = next.pages.length;
      next.pages = next.pages.filter((p) => p.id !== mutation.pageId);
      if (next.pages.length === before) return { ok: false, error: "Page not found" };
      break;
    }
    case "update_seo": {
      next.seo = { ...next.seo, ...mutation.patch };
      break;
    }
    case "attach_asset": {
      next.assets[mutation.assetKey] = mutation.asset;
      break;
    }
    default: {
      const _exhaustive: never = mutation;
      return { ok: false, error: `Unsupported mutation ${(_exhaustive as V2Mutation).op}` };
    }
  }

  next.revision = (next.revision || 1) + 1;
  next.updatedAt = new Date().toISOString();
  return { ok: true, config: next, summary: summarize(mutation) };
}

export function applyV2Mutations(
  config: V2ProjectConfig,
  mutations: V2Mutation[],
): MutationResult {
  let current = config;
  const summaries: string[] = [];
  for (const m of mutations) {
    const result = applyV2Mutation(current, m);
    if (!result.ok) return result;
    current = result.config;
    summaries.push(result.summary);
  }
  return { ok: true, config: current, summary: summaries.join("; ") };
}

function summarize(m: V2Mutation): string {
  switch (m.op) {
    case "update_brand":
      return "Updated brand";
    case "update_theme":
      return "Updated theme";
    case "update_behavior":
      return "Updated behavior";
    case "update_component_content":
      return `Updated ${m.sectionId} content`;
    case "reorder_section":
      return `Reordered sections on ${m.pageId}`;
    case "change_component_variant":
      return `Changed variant to ${m.variantId}`;
    default:
      return m.op;
  }
}
