import type { V2BrandConfig, V2CategoryId } from "./types.ts";
import { listStarterBlueprintsForCategory, getStarterBlueprint } from "./init.ts";
import type { V2BlueprintRecord } from "./types.ts";

export type BrandExtraction = {
  brand: V2BrandConfig;
  categoryId: V2CategoryId;
  blueprintId: string;
  missingFields: string[];
  followUpQuestions: string[];
  confidence: number;
  rationale: string;
};

const COLOR_RE = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b|\b(dark green|cream|navy|black|white|gold|terracotta|beige|ivory)\b/gi;

/**
 * Deterministic first-pass brand/category extraction from natural language.
 * LLM can refine later; this keeps V2 usable without a coding agent.
 */
export function extractBrandAndClassify(input: string): BrandExtraction {
  const text = String(input || "").trim();
  const lower = text.toLowerCase();

  const brand: V2BrandConfig = {
    description: text.slice(0, 500),
  };

  // Name patterns: "called X", "named X", "my company X"
  const nameMatch =
    text.match(/\b(?:called|named)\s+([A-Z][\w'&. -]{1,40})/) ||
    text.match(/\b(?:I own|we run|my)\s+(?:a\s+)?(?:.+?\s+)?(?:restaurant|cafe|studio|agency|company|business)\s+(?:called|named)\s+([A-Z][\w'&. -]{1,40})/i);
  if (nameMatch?.[1]) brand.businessName = nameMatch[1].trim().replace(/[.,].*$/, "");

  const colors = [...text.matchAll(COLOR_RE)].map((m) => m[0]);
  if (colors[0]) brand.primaryColor = normalizeColorToken(colors[0]);
  if (colors[1]) brand.secondaryColor = normalizeColorToken(colors[1]);
  if (colors[2]) brand.accentColor = normalizeColorToken(colors[2]);

  if (/\b(upscale|warm|minimal|bold|modern|classic|editorial)\b/i.test(text)) {
    brand.tone = (text.match(/\b(upscale|warm|minimal|bold|modern|classic|editorial)\b/i) || [])[0];
  }

  const categoryId = classifyCategory(lower);
  const blueprint = selectBlueprint(categoryId, lower);
  const required = blueprint.definition.requiredBrandFields || defaultRequired(categoryId);
  const missingFields = required.filter((f) => !(brand as Record<string, unknown>)[f]);

  const followUpQuestions = missingFields.map((f) => questionForField(f, categoryId));

  // Always ask for logo if missing — high value, low friction.
  if (!brand.logoAssetId) {
    followUpQuestions.push("Do you have a logo file you can upload (or should we use a text wordmark for now)?");
  }

  return {
    brand,
    categoryId,
    blueprintId: blueprint.id,
    missingFields,
    followUpQuestions: dedupe(followUpQuestions).slice(0, 5),
    confidence: brand.businessName ? 0.75 : 0.55,
    rationale: `Classified as ${categoryId}; selected blueprint ${blueprint.id} (${blueprint.name}).`,
  };
}

export function classifyCategory(lower: string): V2CategoryId {
  if (
    /restaurant|cafe|bistro|bar|menu|pasta|dining|hospitality|reservation|chef|food\b/.test(
      lower,
    )
  ) {
    return "restaurant";
  }
  if (
    /lawyer|attorney|consult|agency|studio|design|creative|coach|advisor|professional|firm\b/.test(
      lower,
    )
  ) {
    return "professional";
  }
  return "local_service";
}

function selectBlueprint(categoryId: V2CategoryId, lower: string): V2BlueprintRecord {
  const options = listStarterBlueprintsForCategory(categoryId);
  const preferModern = /modern|bold|contemporary|sleek|minimal/.test(lower);
  const preferClassic = /classic|traditional|warm|editorial|timeless/.test(lower);
  if (preferModern) {
    return options.find((b) => /modern/i.test(b.name)) || options[0];
  }
  if (preferClassic) {
    return options.find((b) => /classic/i.test(b.name)) || options[0];
  }
  // Default: classic for services/professional, modern for restaurant if mentioned book/reserve
  if (categoryId === "restaurant" && /book|reserv|gallery/.test(lower)) {
    return getStarterBlueprint("restaurant_modern") || options[0];
  }
  return options.find((b) => /classic/i.test(b.name)) || options[0];
}

function defaultRequired(categoryId: V2CategoryId): string[] {
  if (categoryId === "restaurant") return ["businessName", "address", "hours", "phone"];
  if (categoryId === "professional") return ["businessName", "email", "primaryOffering"];
  return ["businessName", "phone", "primaryOffering"];
}

function questionForField(field: string, categoryId: V2CategoryId): string {
  switch (field) {
    case "businessName":
      return "What is the exact business name as it should appear on the site?";
    case "address":
      return "What is the street address (or city if you prefer less detail)?";
    case "hours":
      return categoryId === "restaurant"
        ? "What are your opening hours?"
        : "What are your business hours?";
    case "phone":
      return "What phone number should customers call?";
    case "email":
      return "What email should contact forms use?";
    case "primaryOffering":
      return "In one sentence, what is your primary offering?";
    default:
      return `Could you share your ${field}?`;
  }
}

function normalizeColorToken(raw: string): string {
  const t = raw.toLowerCase();
  const map: Record<string, string> = {
    "dark green": "#14532d",
    cream: "#f5f0e6",
    navy: "#0f172a",
    black: "#0a0a0a",
    white: "#ffffff",
    gold: "#c4a574",
    terracotta: "#c2410c",
    beige: "#f5f5dc",
    ivory: "#fffff0",
  };
  if (raw.startsWith("#")) return raw;
  return map[t] || raw;
}

function dedupe(items: string[]): string[] {
  return [...new Set(items)];
}
