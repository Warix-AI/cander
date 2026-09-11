import { applyBrandColorsToTheme, BEHAVIOR_PRESETS, THEME_PRESETS } from "./presets.ts";
import { getVariantContract } from "./registry.ts";
import type {
  V2BlueprintRecord,
  V2BrandConfig,
  V2PageConfig,
  V2ProjectConfig,
  V2SectionInstance,
} from "./types.ts";
import { STARTER_BLUEPRINTS } from "./blueprints.ts";

function newSectionId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Snapshot a blueprint into an independent project configuration.
 * Later blueprint edits do not mutate this object.
 */
export function initializeProjectConfigFromBlueprint(opts: {
  blueprint: V2BlueprintRecord;
  brand?: V2BrandConfig;
  businessDescription?: string;
}): V2ProjectConfig {
  const bp = opts.blueprint;
  const brand: V2BrandConfig = {
    ...(opts.brand || {}),
    description: opts.brand?.description || opts.businessDescription || bp.description,
  };
  const themeBase =
    THEME_PRESETS[bp.themePresetId as keyof typeof THEME_PRESETS]?.tokens ||
    THEME_PRESETS.clean_minimal.tokens;
  const behavior =
    BEHAVIOR_PRESETS[bp.behaviorPresetId as keyof typeof BEHAVIOR_PRESETS]?.tokens ||
    BEHAVIOR_PRESETS.subtle_motion.tokens;

  const pages: V2PageConfig[] = bp.definition.pages.map((p) => ({
    id: p.id,
    path: p.path,
    title: p.title,
    seo: {
      title: `${brand.businessName || "Site"} — ${p.title}`,
      description: brand.tagline || brand.description || "",
    },
    sections: p.sections.map((s) => {
      const section: V2SectionInstance = {
        id: s.id || newSectionId(s.componentType),
        componentType: s.componentType,
        variantId: s.variantId,
        content: { ...(s.content || {}) },
        config: s.config ? { ...s.config } : {},
        optional: s.optional,
      };
      // Soft-fill business name into headlines when still placeholder-like.
      if (brand.businessName && typeof section.content.headline === "string") {
        /* keep blueprint headline; brand applied in copy pass */
      }
      return section;
    }),
  }));

  return {
    version: 1,
    builderVersion: "v2_config",
    blueprintId: bp.id,
    blueprintVersion: bp.version,
    categoryId: bp.categoryId,
    brand,
    themePresetId: bp.themePresetId,
    theme: applyBrandColorsToTheme(themeBase, brand),
    behaviorPresetId: bp.behaviorPresetId,
    behavior,
    header: {
      variantId: bp.headerVariantId,
      content: {
        cta_label: brand.ctaPreference || "Contact",
        cta_url: "/contact",
        ...(bp.definition.headerContent || {}),
      },
      config: { sticky: true },
    },
    footer: {
      variantId: bp.footerVariantId,
      content: {
        blurb: brand.description || "",
        legal: `© ${new Date().getFullYear()} ${brand.businessName || "All rights reserved"}`,
        ...(bp.definition.footerContent || {}),
      },
    },
    pages,
    seo: {
      titleFormat: `${brand.businessName || "Site"} — %s`,
      description: brand.description || "",
      ogImageAssetId: null,
    },
    assets: {},
    revision: 1,
    updatedAt: new Date().toISOString(),
  };
}

export function getStarterBlueprint(id: string): V2BlueprintRecord | null {
  const found = STARTER_BLUEPRINTS.find((b) => b.id === id);
  return found ? structuredClone(found) : null;
}

export function listStarterBlueprintsForCategory(categoryId: string): V2BlueprintRecord[] {
  return STARTER_BLUEPRINTS.filter((b) => b.categoryId === categoryId && b.status === "active");
}

/** Apply brand fields into common content slots without inventing new schema keys. */
export function hydrateConfigWithBrand(config: V2ProjectConfig): V2ProjectConfig {
  const brand = config.brand;
  const next: V2ProjectConfig = structuredClone(config);
  next.theme = applyBrandColorsToTheme(next.theme, brand);
  next.seo.description = brand.description || next.seo.description;
  next.footer.content.legal =
    `© ${new Date().getFullYear()} ${brand.businessName || "All rights reserved"}`;
  if (brand.description) next.footer.content.blurb = brand.description;

  for (const page of next.pages) {
    for (const section of page.sections) {
      const contract = getVariantContract(section.variantId);
      if (!contract) continue;
      if (brand.phone && "phone" in contract.contentSchema && !section.content.phone) {
        section.content.phone = brand.phone;
      }
      if (brand.email && "email" in contract.contentSchema && !section.content.email) {
        section.content.email = brand.email;
      }
      if (brand.address && "address" in contract.contentSchema && !section.content.address) {
        section.content.address = brand.address;
      }
      if (brand.hours && "hours" in contract.contentSchema && !section.content.hours) {
        section.content.hours = brand.hours;
      }
    }
  }
  next.updatedAt = new Date().toISOString();
  return next;
}
