/**
 * Component registry contracts — AI sees schemas, not React source.
 * Max 3 variants per type (enforced here).
 */

export type FieldSchema = {
  type: "string" | "url" | "email" | "phone" | "image" | "string_array" | "richtext" | "boolean";
  required?: boolean;
  description?: string;
};

export type VariantContract = {
  id: string;
  typeId: string;
  name: string;
  description: string;
  rendererId: string;
  contentSchema: Record<string, FieldSchema>;
  configSchema: Record<string, FieldSchema>;
  capabilities: string[];
  responsive: string[];
};

const MAX_VARIANTS = 3;

function assertMax3(typeId: string, variants: VariantContract[]) {
  if (variants.length > MAX_VARIANTS) {
    throw new Error(`Component type ${typeId} exceeds max ${MAX_VARIANTS} variants`);
  }
}

const HERO: VariantContract[] = [
  {
    id: "hero_centered",
    typeId: "hero",
    name: "Centered hero",
    description: "Centered copy over imagery.",
    rendererId: "hero_centered",
    contentSchema: {
      eyebrow: { type: "string" },
      headline: { type: "string", required: true },
      supporting_text: { type: "string" },
      primary_cta_label: { type: "string" },
      primary_cta_url: { type: "url" },
      secondary_cta_label: { type: "string" },
      secondary_cta_url: { type: "url" },
      image: { type: "image" },
      image_alt: { type: "string" },
    },
    configSchema: {
      section_height: { type: "string" },
      background_style: { type: "string" },
    },
    capabilities: ["button_navigation", "phone_link", "external_url"],
    responsive: ["stack_copy", "reduce_padding", "scale_headline"],
  },
  {
    id: "hero_split",
    typeId: "hero",
    name: "Split hero",
    description: "Copy left, image right.",
    rendererId: "hero_split",
    contentSchema: {
      eyebrow: { type: "string" },
      headline: { type: "string", required: true },
      supporting_text: { type: "string" },
      primary_cta_label: { type: "string" },
      primary_cta_url: { type: "url" },
      secondary_cta_label: { type: "string" },
      secondary_cta_url: { type: "url" },
      image: { type: "image" },
      image_alt: { type: "string" },
    },
    configSchema: {
      image_position: { type: "string" },
      alignment: { type: "string" },
    },
    capabilities: ["button_navigation"],
    responsive: ["stack_vertical", "image_below"],
  },
  {
    id: "hero_editorial",
    typeId: "hero",
    name: "Editorial hero",
    description: "Large type with supporting visual below.",
    rendererId: "hero_editorial",
    contentSchema: {
      eyebrow: { type: "string" },
      headline: { type: "string", required: true },
      supporting_text: { type: "string" },
      primary_cta_label: { type: "string" },
      primary_cta_url: { type: "url" },
      image: { type: "image" },
      image_alt: { type: "string" },
    },
    configSchema: {},
    capabilities: ["button_navigation"],
    responsive: ["scale_headline", "full_bleed_image"],
  },
];
assertMax3("hero", HERO);

const FEATURES: VariantContract[] = [
  {
    id: "features_grid_3",
    typeId: "features",
    name: "Three-up grid",
    description: "Three feature cards.",
    rendererId: "features_grid_3",
    contentSchema: {
      eyebrow: { type: "string" },
      headline: { type: "string", required: true },
      items: { type: "string_array", required: true, description: "JSON array of {title,body}" },
    },
    configSchema: { columns: { type: "string" } },
    capabilities: [],
    responsive: ["3_to_1_columns"],
  },
  {
    id: "features_list",
    typeId: "features",
    name: "Stacked list",
    description: "Vertical feature list.",
    rendererId: "features_list",
    contentSchema: {
      headline: { type: "string", required: true },
      items: { type: "string_array", required: true },
    },
    configSchema: {},
    capabilities: [],
    responsive: ["tighten_spacing"],
  },
];
assertMax3("features", FEATURES);

const IMAGE_TEXT: VariantContract[] = [
  {
    id: "image_text_left",
    typeId: "image_text",
    name: "Image left",
    description: "Image + copy split.",
    rendererId: "image_text_left",
    contentSchema: {
      headline: { type: "string", required: true },
      body: { type: "string" },
      cta_label: { type: "string" },
      cta_url: { type: "url" },
      image: { type: "image" },
      image_alt: { type: "string" },
    },
    configSchema: { image_position: { type: "string" } },
    capabilities: ["button_navigation"],
    responsive: ["stack_vertical"],
  },
];

const TESTIMONIALS: VariantContract[] = [
  {
    id: "testimonials_cards",
    typeId: "testimonials",
    name: "Quote cards",
    description: "Two–three testimonial cards.",
    rendererId: "testimonials_cards",
    contentSchema: {
      headline: { type: "string" },
      items: { type: "string_array", required: true, description: "JSON {quote,name,role}" },
    },
    configSchema: {},
    capabilities: [],
    responsive: ["1_col_mobile"],
  },
  {
    id: "testimonials_single",
    typeId: "testimonials",
    name: "Single quote",
    description: "One large testimonial.",
    rendererId: "testimonials_single",
    contentSchema: {
      quote: { type: "string", required: true },
      name: { type: "string" },
      role: { type: "string" },
    },
    configSchema: {},
    capabilities: [],
    responsive: ["reduce_type"],
  },
];

const GALLERY: VariantContract[] = [
  {
    id: "gallery_grid",
    typeId: "gallery",
    name: "Gallery grid",
    description: "Responsive image grid.",
    rendererId: "gallery_grid",
    contentSchema: {
      headline: { type: "string" },
      images: { type: "string_array", required: true },
    },
    configSchema: { columns: { type: "string" } },
    capabilities: [],
    responsive: ["3_to_1_columns"],
  },
];

const STATS: VariantContract[] = [
  {
    id: "stats_row",
    typeId: "stats",
    name: "Stats row",
    description: "Key metrics in a row.",
    rendererId: "stats_row",
    contentSchema: {
      items: { type: "string_array", required: true, description: "JSON {value,label}" },
    },
    configSchema: {},
    capabilities: [],
    responsive: ["wrap"],
  },
];

const FAQ: VariantContract[] = [
  {
    id: "faq_accordion",
    typeId: "faq",
    name: "FAQ accordion",
    description: "Expandable Q&A.",
    rendererId: "faq_accordion",
    contentSchema: {
      headline: { type: "string" },
      items: { type: "string_array", required: true, description: "JSON {q,a}" },
    },
    configSchema: {},
    capabilities: ["accordion_expansion"],
    responsive: ["full_width"],
  },
];

const CTA: VariantContract[] = [
  {
    id: "cta_band",
    typeId: "cta",
    name: "CTA band",
    description: "Full-width call to action.",
    rendererId: "cta_band",
    contentSchema: {
      headline: { type: "string", required: true },
      body: { type: "string" },
      primary_cta_label: { type: "string" },
      primary_cta_url: { type: "url" },
    },
    configSchema: {},
    capabilities: ["button_navigation", "phone_link"],
    responsive: ["stack_cta"],
  },
];

const CONTACT: VariantContract[] = [
  {
    id: "contact_split",
    typeId: "contact",
    name: "Contact split",
    description: "Details + form.",
    rendererId: "contact_split",
    contentSchema: {
      headline: { type: "string", required: true },
      body: { type: "string" },
      phone: { type: "phone" },
      email: { type: "email" },
      address: { type: "string" },
      form_cta_label: { type: "string" },
    },
    configSchema: {},
    capabilities: ["form_submit", "phone_link", "email_link"],
    responsive: ["stack_vertical"],
  },
];

const FORM: VariantContract[] = [
  {
    id: "form_simple",
    typeId: "form",
    name: "Simple form",
    description: "Name, email, message.",
    rendererId: "form_simple",
    contentSchema: {
      headline: { type: "string" },
      submit_label: { type: "string" },
      success_message: { type: "string" },
    },
    configSchema: {},
    capabilities: ["form_submit"],
    responsive: ["full_width"],
  },
];

const HOURS: VariantContract[] = [
  {
    id: "hours_location",
    typeId: "hours_location",
    name: "Hours & location",
    description: "Address, hours, map placeholder.",
    rendererId: "hours_location",
    contentSchema: {
      headline: { type: "string" },
      address: { type: "string" },
      hours: { type: "string" },
      phone: { type: "phone" },
      map_embed_url: { type: "url" },
    },
    configSchema: {},
    capabilities: ["phone_link"],
    responsive: ["stack_vertical"],
  },
];

const PRICING: VariantContract[] = [
  {
    id: "pricing_list",
    typeId: "pricing_list",
    name: "Pricing list",
    description: "Service or package list.",
    rendererId: "pricing_list",
    contentSchema: {
      headline: { type: "string" },
      items: { type: "string_array", required: true, description: "JSON {name,price,detail}" },
    },
    configSchema: {},
    capabilities: [],
    responsive: ["stack"],
  },
];

const MENU: VariantContract[] = [
  {
    id: "menu_list",
    typeId: "menu_list",
    name: "Menu list",
    description: "Restaurant-style menu groups.",
    rendererId: "menu_list",
    contentSchema: {
      headline: { type: "string" },
      groups: { type: "string_array", required: true, description: "JSON {title,items:[{name,price,desc}]}" },
    },
    configSchema: {},
    capabilities: [],
    responsive: ["stack"],
  },
];

const PROCESS: VariantContract[] = [
  {
    id: "process_steps",
    typeId: "process",
    name: "Process steps",
    description: "Numbered steps.",
    rendererId: "process_steps",
    contentSchema: {
      headline: { type: "string" },
      items: { type: "string_array", required: true, description: "JSON {title,body}" },
    },
    configSchema: {},
    capabilities: [],
    responsive: ["1_col_mobile"],
  },
];

const HEADER: VariantContract[] = [
  {
    id: "header_simple",
    typeId: "header",
    name: "Simple header",
    description: "Logo + links + CTA.",
    rendererId: "header_simple",
    contentSchema: {
      cta_label: { type: "string" },
      cta_url: { type: "url" },
    },
    configSchema: { sticky: { type: "boolean" } },
    capabilities: ["menu_behavior", "button_navigation"],
    responsive: ["collapse_nav"],
  },
  {
    id: "header_centered",
    typeId: "header",
    name: "Centered header",
    description: "Centered logo with flanking links.",
    rendererId: "header_centered",
    contentSchema: {
      cta_label: { type: "string" },
      cta_url: { type: "url" },
    },
    configSchema: {},
    capabilities: ["menu_behavior"],
    responsive: ["collapse_nav"],
  },
  {
    id: "header_cta",
    typeId: "header",
    name: "CTA-forward header",
    description: "Emphasizes primary action.",
    rendererId: "header_cta",
    contentSchema: {
      cta_label: { type: "string", required: true },
      cta_url: { type: "url" },
    },
    configSchema: {},
    capabilities: ["button_navigation"],
    responsive: ["collapse_nav"],
  },
];

const FOOTER: VariantContract[] = [
  {
    id: "footer_simple",
    typeId: "footer",
    name: "Simple footer",
    description: "Brand + links + legal.",
    rendererId: "footer_simple",
    contentSchema: {
      blurb: { type: "string" },
      legal: { type: "string" },
    },
    configSchema: {},
    capabilities: [],
    responsive: ["stack"],
  },
  {
    id: "footer_columns",
    typeId: "footer",
    name: "Column footer",
    description: "Multi-column links.",
    rendererId: "footer_columns",
    contentSchema: {
      blurb: { type: "string" },
      legal: { type: "string" },
    },
    configSchema: {},
    capabilities: [],
    responsive: ["stack"],
  },
  {
    id: "footer_minimal",
    typeId: "footer",
    name: "Minimal footer",
    description: "Sparse legal line.",
    rendererId: "footer_minimal",
    contentSchema: {
      legal: { type: "string" },
    },
    configSchema: {},
    capabilities: [],
    responsive: ["stack"],
  },
];

const ALL: VariantContract[] = [
  ...HERO,
  ...FEATURES,
  ...IMAGE_TEXT,
  ...TESTIMONIALS,
  ...GALLERY,
  ...STATS,
  ...FAQ,
  ...CTA,
  ...CONTACT,
  ...FORM,
  ...HOURS,
  ...PRICING,
  ...MENU,
  ...PROCESS,
  ...HEADER,
  ...FOOTER,
];

const BY_ID = new Map(ALL.map((v) => [v.id, v]));

export function listVariantContracts(): VariantContract[] {
  return ALL;
}

export function getVariantContract(variantId: string): VariantContract | null {
  return BY_ID.get(variantId) || null;
}

export function listVariantsForType(typeId: string): VariantContract[] {
  return ALL.filter((v) => v.typeId === typeId);
}

/** Compact capability card for AI prompts — no React source. */
export function capabilityCardForVariant(variantId: string): string {
  const v = getVariantContract(variantId);
  if (!v) return `Unknown variant: ${variantId}`;
  const fields = Object.entries(v.contentSchema)
    .map(([k, s]) => `${k}${s.required ? "*" : ""} (${s.type})`)
    .join(", ");
  return `${v.typeId} / ${v.id} — ${v.name}. Content: ${fields}. Capabilities: ${v.capabilities.join(", ") || "none"}.`;
}

export function validateContentAgainstSchema(
  variantId: string,
  content: Record<string, unknown>,
): { ok: true } | { ok: false; error: string } {
  const v = getVariantContract(variantId);
  if (!v) return { ok: false, error: `Unknown variant "${variantId}"` };
  for (const key of Object.keys(content)) {
    if (!(key in v.contentSchema) && !(key in v.configSchema)) {
      return { ok: false, error: `Field "${key}" is not in schema for ${variantId}` };
    }
  }
  for (const [key, schema] of Object.entries(v.contentSchema)) {
    if (schema.required) {
      const val = content[key];
      if (val === undefined || val === null || val === "") {
        return { ok: false, error: `Required field "${key}" missing for ${variantId}` };
      }
    }
  }
  return { ok: true };
}
