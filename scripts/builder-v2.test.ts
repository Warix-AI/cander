/**
 * Website Builder V2 — config assembly unit tests (no DB / no V1 sandbox).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { extractBrandAndClassify, classifyCategory } from "../lib/build/v2/classify.ts";
import {
  getStarterBlueprint,
  hydrateConfigWithBrand,
  initializeProjectConfigFromBlueprint,
  listStarterBlueprintsForCategory,
} from "../lib/build/v2/init.ts";
import { applyV2Mutation, applyV2Mutations } from "../lib/build/v2/mutations.ts";
import { listVariantsForType, validateContentAgainstSchema, getVariantContract } from "../lib/build/v2/registry.ts";
import { STARTER_BLUEPRINTS, STARTER_CATEGORIES } from "../lib/build/v2/blueprints.ts";
import { isWebsiteBuilderV2Enabled } from "../lib/build/v2/flag.ts";

describe("builder v2 flag", () => {
  it("defaults off", () => {
    const prev = process.env.CANDER_WEBSITE_BUILDER_V2;
    delete process.env.CANDER_WEBSITE_BUILDER_V2;
    assert.equal(isWebsiteBuilderV2Enabled(), false);
    if (prev !== undefined) process.env.CANDER_WEBSITE_BUILDER_V2 = prev;
  });
});

describe("catalog shape", () => {
  it("has 3 categories and 6 blueprints (2 each)", () => {
    assert.equal(STARTER_CATEGORIES.length, 3);
    assert.equal(STARTER_BLUEPRINTS.length, 6);
    for (const c of STARTER_CATEGORIES) {
      assert.equal(listStarterBlueprintsForCategory(c.id).length, 2);
    }
  });

  it("enforces max 3 variants per type for types that have variants", () => {
    for (const typeId of ["hero", "features", "testimonials", "header", "footer"]) {
      assert.ok(listVariantsForType(typeId).length <= 3);
    }
  });
});

describe("classification + blueprint selection", () => {
  it("classifies restaurant description and picks restaurant blueprint", () => {
    const text =
      "I own a modern Italian restaurant in Provo called Luca. We specialize in handmade pasta. I want the site to feel upscale but warm. Our colors are dark green and cream.";
    const result = extractBrandAndClassify(text);
    assert.equal(result.categoryId, "restaurant");
    assert.ok(result.blueprintId.startsWith("restaurant_"));
    assert.equal(result.brand.businessName, "Luca");
    assert.ok(result.brand.primaryColor);
    assert.ok(result.followUpQuestions.length >= 1);
  });

  it("classifies local service vs professional", () => {
    assert.equal(classifyCategory("plumbing and hvac for homes"), "local_service");
    assert.equal(classifyCategory("brand design studio and consulting"), "professional");
  });
});

describe("blueprint init snapshot", () => {
  it("creates independent project config from blueprint", () => {
    const bp = getStarterBlueprint("restaurant_classic");
    assert.ok(bp);
    const config = initializeProjectConfigFromBlueprint({
      blueprint: bp!,
      brand: { businessName: "Luca", primaryColor: "#14532d", secondaryColor: "#f5f0e6" },
      businessDescription: "Italian restaurant",
    });
    assert.equal(config.builderVersion, "v2_config");
    assert.equal(config.blueprintId, "restaurant_classic");
    assert.equal(config.blueprintVersion, 1);
    assert.ok(config.pages.length >= 3);
    assert.equal(config.brand.businessName, "Luca");
    assert.equal(config.theme.primary, "#14532d");
    // Mutating blueprint later must not affect snapshot
    const homeSections = config.pages[0].sections.length;
    bp!.definition.pages[0].sections.push({
      id: "x",
      componentType: "cta",
      variantId: "cta_band",
      content: { headline: "x" },
    });
    assert.equal(config.pages[0].sections.length, homeSections);
  });
});

describe("mutations", () => {
  function baseConfig() {
    const bp = getStarterBlueprint("service_classic")!;
    return hydrateConfigWithBrand(
      initializeProjectConfigFromBlueprint({
        blueprint: bp,
        brand: { businessName: "Acme Plumbing", phone: "555-0100" },
      }),
    );
  }

  it("updates hero content", () => {
    const config = baseConfig();
    const hero = config.pages[0].sections.find((s) => s.componentType === "hero")!;
    const result = applyV2Mutation(config, {
      op: "update_component_content",
      pageId: "home",
      sectionId: hero.id,
      content: { headline: "Shorter headline", primary_cta_label: "Book a Table" },
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const updated = result.config.pages[0].sections.find((s) => s.id === hero.id)!;
    assert.equal(updated.content.headline, "Shorter headline");
    assert.equal(updated.content.primary_cta_label, "Book a Table");
  });

  it("rejects unknown content fields", () => {
    const config = baseConfig();
    const hero = config.pages[0].sections.find((s) => s.componentType === "hero")!;
    const result = applyV2Mutation(config, {
      op: "update_component_content",
      pageId: "home",
      sectionId: hero.id,
      content: { invented_field: "nope" },
    });
    assert.equal(result.ok, false);
  });

  it("rejects invalid variant", () => {
    const config = baseConfig();
    const hero = config.pages[0].sections.find((s) => s.componentType === "hero")!;
    const result = applyV2Mutation(config, {
      op: "change_component_variant",
      pageId: "home",
      sectionId: hero.id,
      variantId: "does_not_exist",
    });
    assert.equal(result.ok, false);
  });

  it("reorders sections", () => {
    const config = baseConfig();
    const ids = config.pages[0].sections.map((s) => s.id);
    const reversed = [...ids].reverse();
    const result = applyV2Mutation(config, {
      op: "reorder_section",
      pageId: "home",
      sectionIds: reversed,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(
      result.config.pages[0].sections.map((s) => s.id),
      reversed,
    );
  });

  it("updates theme tokens", () => {
    const config = baseConfig();
    const result = applyV2Mutations(config, [
      { op: "update_theme", patch: { density: "compact" } },
      { op: "update_brand", patch: { primaryColor: "#111111" } },
    ]);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.config.theme.density, "compact");
    assert.equal(result.config.theme.primary, "#111111");
  });
});

describe("schema validation", () => {
  it("validates required hero headline", () => {
    const bad = validateContentAgainstSchema("hero_centered", {});
    assert.equal(bad.ok, false);
    const good = validateContentAgainstSchema("hero_centered", { headline: "Hello" });
    assert.equal(good.ok, true);
  });

  it("resolves variant contracts", () => {
    assert.ok(getVariantContract("hero_split"));
    assert.equal(getVariantContract("nope"), null);
  });
});
