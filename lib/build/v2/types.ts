/**
 * Website Builder V2 — config-driven assembly (parallel to V1 coding-agent builder).
 * V1 projects keep builder_version = "v1". V2 uses "v2_config".
 */

export type BuilderVersion = "v1" | "v2_config";

export type V2CategoryId = "local_service" | "restaurant" | "professional";

export type V2ThemePresetId = "clean_minimal" | "warm_editorial" | "bold_modern";
export type V2BehaviorPresetId = "minimal_motion" | "subtle_motion" | "expressive_motion";

export type V2HeaderVariantId = "header_simple" | "header_centered" | "header_cta";
export type V2FooterVariantId = "footer_simple" | "footer_columns" | "footer_minimal";

/** Component type IDs — many types allowed; each has ≤3 variants. */
export type V2ComponentTypeId =
  | "hero"
  | "features"
  | "image_text"
  | "testimonials"
  | "gallery"
  | "stats"
  | "faq"
  | "cta"
  | "contact"
  | "form"
  | "hours_location"
  | "pricing_list"
  | "menu_list"
  | "process";

export type V2ContentValue = string | number | boolean | null | string[] | Record<string, unknown>;

export type V2SectionInstance = {
  id: string;
  componentType: V2ComponentTypeId | string;
  variantId: string;
  content: Record<string, V2ContentValue>;
  config?: Record<string, V2ContentValue>;
  optional?: boolean;
};

export type V2PageConfig = {
  id: string;
  path: string;
  title: string;
  seo?: { title?: string; description?: string };
  sections: V2SectionInstance[];
};

export type V2BrandConfig = {
  businessName?: string;
  description?: string;
  tagline?: string;
  tone?: string;
  targetCustomer?: string;
  primaryOffering?: string;
  differentiators?: string[];
  logoAssetId?: string | null;
  faviconAssetId?: string | null;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  phone?: string;
  email?: string;
  address?: string;
  hours?: string;
  social?: Record<string, string>;
  ctaPreference?: string;
  photographyStyle?: string;
};

export type V2ThemeTokens = {
  background: string;
  foreground: string;
  muted: string;
  mutedForeground: string;
  primary: string;
  primaryForeground: string;
  accent: string;
  accentForeground: string;
  border: string;
  radius: string;
  fontDisplay: string;
  fontBody: string;
  container: string;
  sectionY: string;
  density: "comfortable" | "compact" | "airy";
  shadow: string;
};

export type V2BehaviorTokens = {
  motion: "off" | "subtle" | "expressive";
  smoothScroll: boolean;
  hoverScale: boolean;
  menuTransition: "instant" | "fade" | "slide";
};

export type V2ProjectConfig = {
  version: 1;
  builderVersion: "v2_config";
  blueprintId: string;
  blueprintVersion: number;
  categoryId: V2CategoryId | string;
  brand: V2BrandConfig;
  themePresetId: V2ThemePresetId | string;
  theme: V2ThemeTokens;
  behaviorPresetId: V2BehaviorPresetId | string;
  behavior: V2BehaviorTokens;
  header: {
    variantId: V2HeaderVariantId | string;
    content: Record<string, V2ContentValue>;
    config?: Record<string, V2ContentValue>;
  };
  footer: {
    variantId: V2FooterVariantId | string;
    content: Record<string, V2ContentValue>;
    config?: Record<string, V2ContentValue>;
  };
  pages: V2PageConfig[];
  seo: {
    titleFormat?: string;
    description?: string;
    ogImageAssetId?: string | null;
  };
  assets: Record<string, { id: string; url?: string; alt?: string }>;
  revision: number;
  updatedAt: string;
};

export type V2BlueprintDefinition = {
  pages: Array<{
    id: string;
    path: string;
    title: string;
    sections: Array<{
      id: string;
      componentType: string;
      variantId: string;
      content?: Record<string, V2ContentValue>;
      config?: Record<string, V2ContentValue>;
      optional?: boolean;
    }>;
  }>;
  headerContent?: Record<string, V2ContentValue>;
  footerContent?: Record<string, V2ContentValue>;
  requiredBrandFields?: string[];
  rules?: Record<string, string>;
};

export type V2BlueprintRecord = {
  id: string;
  name: string;
  categoryId: string;
  description: string;
  status: "draft" | "active" | "inactive";
  version: number;
  themePresetId: string;
  behaviorPresetId: string;
  headerVariantId: string;
  footerVariantId: string;
  definition: V2BlueprintDefinition;
  sortOrder: number;
};

/** Structured AI mutations — validated server-side before apply. */
export type V2Mutation =
  | { op: "update_brand"; patch: Partial<V2BrandConfig> }
  | { op: "update_theme"; patch: Partial<V2ThemeTokens>; themePresetId?: string }
  | { op: "update_behavior"; patch: Partial<V2BehaviorTokens>; behaviorPresetId?: string }
  | {
      op: "update_global_component";
      target: "header" | "footer";
      content?: Record<string, V2ContentValue>;
      config?: Record<string, V2ContentValue>;
      variantId?: string;
    }
  | {
      op: "update_component_content";
      pageId: string;
      sectionId: string;
      content: Record<string, V2ContentValue>;
    }
  | {
      op: "update_component_config";
      pageId: string;
      sectionId: string;
      config: Record<string, V2ContentValue>;
    }
  | {
      op: "change_component_variant";
      pageId: string;
      sectionId: string;
      variantId: string;
    }
  | {
      op: "add_section";
      pageId: string;
      section: V2SectionInstance;
      afterSectionId?: string | null;
    }
  | { op: "remove_section"; pageId: string; sectionId: string }
  | { op: "reorder_section"; pageId: string; sectionIds: string[] }
  | {
      op: "add_page";
      page: V2PageConfig;
    }
  | {
      op: "update_page";
      pageId: string;
      patch: Partial<Pick<V2PageConfig, "title" | "path" | "seo">>;
    }
  | { op: "remove_page"; pageId: string }
  | {
      op: "update_seo";
      patch: Partial<V2ProjectConfig["seo"]>;
    }
  | {
      op: "attach_asset";
      assetKey: string;
      asset: { id: string; url?: string; alt?: string };
    };
