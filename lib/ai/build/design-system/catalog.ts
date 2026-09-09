/**
 * Cander design-system catalog — variant ids the planner may choose.
 */

export const SITE_CATALOG = {
  headers: [
    { id: "sticky-minimal", label: "Sticky minimal nav" },
    { id: "sticky-cta", label: "Sticky nav with CTA" },
    { id: "centered-brand", label: "Centered brand" },
    { id: "split-bar", label: "Split utility bar" },
  ],
  heroes: [
    { id: "split-copy-media", label: "Split copy + media" },
    { id: "centered-bold", label: "Centered bold" },
    { id: "editorial-left", label: "Editorial left" },
    { id: "dark-overlay", label: "Dark overlay hero" },
  ],
  sections: [
    { kind: "services", variants: ["grid-3", "grid-2", "cards"] },
    { kind: "features", variants: ["alternating", "grid-3", "split"] },
    { kind: "stats", variants: ["strip", "grid-3"] },
    { kind: "process", variants: ["strip", "grid-3"] },
    { kind: "testimonials", variants: ["cards", "carousel-static"] },
    { kind: "gallery", variants: ["grid-3", "carousel-static"] },
    { kind: "faq", variants: ["accordion", "grid-2"] },
    { kind: "cta", variants: ["centered", "split"] },
    { kind: "form", variants: ["split", "centered"] },
    { kind: "trust", variants: ["logo-row", "strip"] },
  ],
  footers: [
    { id: "multi-column", label: "Multi-column" },
    { id: "simple-bar", label: "Simple bar" },
    { id: "cta-footer", label: "CTA footer" },
  ],
} as const;

export function catalogPromptBlock(): string {
  return [
    "Use ONLY these catalog ids:",
    `headers: ${SITE_CATALOG.headers.map((h) => h.id).join(", ")}`,
    `heroes (encode on first home section as imageSlot "hero-<id>"): ${SITE_CATALOG.heroes.map((h) => h.id).join(", ")}`,
    ...SITE_CATALOG.sections.map(
      (s) => `${s.kind} variants: ${s.variants.join(", ")}`,
    ),
    `footers: ${SITE_CATALOG.footers.map((f) => f.id).join(", ")}`,
    "Pick different header/hero/section/footer combinations so designs diverge by industry.",
    "Home needs 5–8 sections including hero-like first section, services/features, social proof, FAQ or process, and contact/form.",
    "customGaps: list only capabilities that cannot be built from this catalog (auth, payments, realtime, native apps, etc).",
  ].join("\n");
}
