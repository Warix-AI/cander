/**
 * Typed website/app plan produced by planWebsite (chat model).
 * Composed deterministically into Next.js files via the Cander design system.
 */

export type SitePageId = "home" | "about" | "services" | "contact" | "pricing" | string;

export type HeaderVariant = "sticky-minimal" | "sticky-cta" | "centered-brand" | "split-bar";
export type HeroVariant =
  | "split-copy-media"
  | "centered-bold"
  | "editorial-left"
  | "dark-overlay";
export type SectionKind =
  | "services"
  | "features"
  | "stats"
  | "process"
  | "testimonials"
  | "gallery"
  | "faq"
  | "cta"
  | "form"
  | "trust";
export type SectionVariant =
  | "grid-3"
  | "grid-2"
  | "alternating"
  | "strip"
  | "cards"
  | "accordion"
  | "carousel-static"
  | "split"
  | "centered"
  | "logo-row";
export type FooterVariant = "multi-column" | "simple-bar" | "cta-footer";
export type LayoutStyle = "editorial" | "bold-modern" | "warm-local" | "clean-saas" | "dark-premium";

export type SiteNavItem = {
  label: string;
  href: string;
};

export type SiteSection = {
  id: string;
  kind: SectionKind;
  variant: SectionVariant;
  eyebrow?: string;
  title: string;
  body?: string;
  items?: Array<{ title: string; body?: string; meta?: string }>;
  ctaLabel?: string;
  ctaHref?: string;
  imageSlot?: string;
};

export type SitePage = {
  id: SitePageId;
  path: string;
  title: string;
  description?: string;
  sections: SiteSection[];
};

export type SiteTheme = {
  layoutStyle: LayoutStyle;
  primary: string;
  primaryForeground: string;
  accent: string;
  background: string;
  foreground: string;
  muted: string;
  mutedForeground: string;
  border: string;
  radius: string;
  fontDisplay: string;
  fontBody: string;
  spacingScale: "compact" | "comfortable" | "airy";
};

export type SiteSpec = {
  businessName: string;
  tagline: string;
  industry: string;
  intent: string;
  phone?: string;
  email?: string;
  location?: string;
  ctaPrimary: { label: string; href: string };
  ctaSecondary?: { label: string; href: string };
  nav: SiteNavItem[];
  headerVariant: HeaderVariant;
  footerVariant: FooterVariant;
  theme: SiteTheme;
  pages: SitePage[];
  /** Features the catalog cannot express — triggers Codex after scaffold. */
  customGaps: string[];
};

export type ScaffoldFile = { path: string; content: string };

const HEADER_VARIANTS: HeaderVariant[] = [
  "sticky-minimal",
  "sticky-cta",
  "centered-brand",
  "split-bar",
];
const HERO_VARIANTS: HeroVariant[] = [
  "split-copy-media",
  "centered-bold",
  "editorial-left",
  "dark-overlay",
];
const FOOTER_VARIANTS: FooterVariant[] = ["multi-column", "simple-bar", "cta-footer"];
const LAYOUT_STYLES: LayoutStyle[] = [
  "editorial",
  "bold-modern",
  "warm-local",
  "clean-saas",
  "dark-premium",
];

export function catalogVariantGuide(): string {
  return [
    `headerVariant: ${HEADER_VARIANTS.join(" | ")}`,
    `hero variants (use as first home section kind=hero via imageSlot/title): ${HERO_VARIANTS.join(" | ")}`,
    `section kinds: services | features | stats | process | testimonials | gallery | faq | cta | form | trust`,
    `section variants: grid-3 | grid-2 | alternating | strip | cards | accordion | carousel-static | split | centered | logo-row`,
    `footerVariant: ${FOOTER_VARIANTS.join(" | ")}`,
    `layoutStyle: ${LAYOUT_STYLES.join(" | ")}`,
  ].join("\n");
}

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}

function pick<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  const s = asString(v);
  return (allowed as readonly string[]).includes(s) ? (s as T) : fallback;
}

function themeFromIndustry(industry: string, layoutStyle: LayoutStyle): SiteTheme {
  const dark = layoutStyle === "dark-premium";
  const warm = layoutStyle === "warm-local" || /tree|hvac|plumb|roof|cafe|bakery|food/i.test(industry);
  const saas = layoutStyle === "clean-saas" || /saas|software|app|platform/i.test(industry);
  if (dark) {
    return {
      layoutStyle,
      primary: "#7dd3a0",
      primaryForeground: "#0b1210",
      accent: "#a5b4fc",
      background: "#0c0f0e",
      foreground: "#e8eee9",
      muted: "#161b19",
      mutedForeground: "#9aa8a0",
      border: "#24302a",
      radius: "12px",
      fontDisplay: "\"DM Sans\", system-ui, sans-serif",
      fontBody: "\"DM Sans\", system-ui, sans-serif",
      spacingScale: "comfortable",
    };
  }
  if (saas) {
    return {
      layoutStyle,
      primary: "#2563eb",
      primaryForeground: "#ffffff",
      accent: "#0ea5e9",
      background: "#f8fafc",
      foreground: "#0f172a",
      muted: "#f1f5f9",
      mutedForeground: "#64748b",
      border: "#e2e8f0",
      radius: "14px",
      fontDisplay: "\"Geist\", \"DM Sans\", system-ui, sans-serif",
      fontBody: "\"DM Sans\", system-ui, sans-serif",
      spacingScale: "comfortable",
    };
  }
  if (warm) {
    return {
      layoutStyle,
      primary: "#1f6b3a",
      primaryForeground: "#ffffff",
      accent: "#c4a574",
      background: "#f7f4ee",
      foreground: "#14231a",
      muted: "#efe8dc",
      mutedForeground: "#5c6b60",
      border: "#ddd4c6",
      radius: "999px",
      fontDisplay: "Georgia, \"Times New Roman\", serif",
      fontBody: "\"DM Sans\", system-ui, sans-serif",
      spacingScale: "airy",
    };
  }
  return {
    layoutStyle,
    primary: "#111827",
    primaryForeground: "#ffffff",
    accent: "#dc2626",
    background: "#ffffff",
    foreground: "#111827",
    muted: "#f4f4f5",
    mutedForeground: "#71717a",
    border: "#e4e4e7",
    radius: "10px",
    fontDisplay: "\"DM Sans\", system-ui, sans-serif",
    fontBody: "\"DM Sans\", system-ui, sans-serif",
    spacingScale: "comfortable",
  };
}

export function defaultSiteSpec(prompt: string): SiteSpec {
  const lower = prompt.toLowerCase();
  const tree = /tree|trim|arbor|removal/i.test(lower);
  const cafe = /cafe|coffee|bakery|restaurant/i.test(lower);
  const saas = /saas|software|dashboard|app\b|platform/i.test(lower);
  const industry = tree
    ? "tree-care"
    : cafe
      ? "cafe"
      : saas
        ? "saas"
        : "local-services";
  const layoutStyle: LayoutStyle = tree
    ? "warm-local"
    : cafe
      ? "editorial"
      : saas
        ? "clean-saas"
        : "bold-modern";
  const businessName = tree
    ? "Summit Tree Co."
    : cafe
      ? "Harbor Roast"
      : saas
        ? "Northline"
        : "Brightline Studio";
  const tagline = tree
    ? "Safe, precise tree care for homes and businesses"
    : cafe
      ? "Neighborhood coffee, carefully made"
      : saas
        ? "Operations software that stays out of the way"
        : "A site that turns visitors into customers";
  const phone = "(555) 014-2288";
  const theme = themeFromIndustry(industry, layoutStyle);
  const heroVariant: HeroVariant = tree
    ? "split-copy-media"
    : cafe
      ? "editorial-left"
      : saas
        ? "centered-bold"
        : "dark-overlay";

  const homeSections: SiteSection[] = [
    {
      id: "hero",
      kind: "features",
      variant: heroVariant === "centered-bold" ? "centered" : "split",
      eyebrow: tagline,
      title: tree
        ? "Tree removal and trimming done right"
        : cafe
          ? "Start your morning at Harbor Roast"
          : saas
            ? "Run your team from one calm workspace"
            : "Built for your next customer",
      body: tree
        ? "Licensed crews, clean sites, and same-week availability for residential and commercial work."
        : cafe
          ? "Single-origin espresso, seasonal pastries, and a room meant for lingering."
          : saas
            ? "Plan work, track status, and keep everyone aligned without another noisy dashboard."
            : "Clear offer, proof, and one obvious next step.",
      ctaLabel: tree ? "Get a free quote" : cafe ? "Find us" : saas ? "Start free" : "Book a call",
      ctaHref: "#contact",
      imageSlot: `hero-${heroVariant}`,
      items: [{ title: heroVariant, body: "hero" }],
    },
    {
      id: "services",
      kind: "services",
      variant: "grid-3",
      title: tree ? "Services" : cafe ? "On the menu" : "What you get",
      items: tree
        ? [
            { title: "Tree removal", body: "Full take-downs with haul-away and site cleanup." },
            { title: "Trimming & shaping", body: "Crown reduction and maintenance for healthy canopy." },
            { title: "Storm response", body: "Priority cleanup when weather hits hard." },
          ]
        : cafe
          ? [
              { title: "Espresso bar", body: "Dialed-in drinks from trusted roasters." },
              { title: "Bakery case", body: "Daily pastry rotation from local bakers." },
              { title: "Workspace hours", body: "Quiet mornings, lively afternoons." },
            ]
          : [
              { title: "Shared inbox", body: "One place for requests and replies." },
              { title: "Live status", body: "See what’s blocked without chasing updates." },
              { title: "Simple reports", body: "Weekly clarity for owners and leads." },
            ],
    },
    {
      id: "process",
      kind: "process",
      variant: "strip",
      title: "How it works",
      items: [
        { title: "1. Tell us the job", body: "Share photos, timing, and constraints." },
        { title: "2. Get a clear plan", body: "Transparent scope and pricing up front." },
        { title: "3. We deliver", body: "On schedule, with a clean finish." },
      ],
    },
    {
      id: "stats",
      kind: "stats",
      variant: "strip",
      title: "Trusted nearby",
      items: [
        { title: "4.9★", body: "Average rating" },
        { title: "1,200+", body: "Jobs completed" },
        { title: "Same week", body: "Typical availability" },
      ],
    },
    {
      id: "testimonials",
      kind: "testimonials",
      variant: "cards",
      title: "What customers say",
      items: [
        {
          title: "Maya R.",
          body: "Showed up on time, explained everything, and left the yard cleaner than they found it.",
          meta: "Homeowner",
        },
        {
          title: "Jordan K.",
          body: "Easy to book and surprisingly polished for a local crew site.",
          meta: "Property manager",
        },
      ],
    },
    {
      id: "faq",
      kind: "faq",
      variant: "accordion",
      title: "Questions",
      items: [
        {
          title: "Do you bring your own equipment?",
          body: "Yes — crews arrive fully equipped for the scoped work.",
        },
        {
          title: "How fast can you start?",
          body: "Most jobs are scheduled within the same week.",
        },
        {
          title: "Are you insured?",
          body: "Fully licensed and insured for residential and commercial work.",
        },
      ],
    },
    {
      id: "contact",
      kind: "form",
      variant: "split",
      title: "Request a callback",
      body: `Call ${phone} or send a note — we respond the same day.`,
      ctaLabel: tree ? "Get a free quote" : "Send message",
      ctaHref: `tel:${phone.replace(/[^\d+]/g, "")}`,
    },
  ];

  return {
    businessName,
    tagline,
    industry,
    intent: prompt.slice(0, 280),
    phone,
    email: "hello@example.com",
    location: "Serving your local area",
    ctaPrimary: {
      label: homeSections[0]?.ctaLabel || "Get started",
      href: "#contact",
    },
    ctaSecondary: { label: "See services", href: "#services" },
    nav: [
      { label: "Services", href: "#services" },
      { label: "Process", href: "#process" },
      { label: "Reviews", href: "#testimonials" },
      { label: "Contact", href: "#contact" },
    ],
    headerVariant: tree ? "sticky-cta" : saas ? "sticky-minimal" : "split-bar",
    footerVariant: tree ? "cta-footer" : "multi-column",
    theme,
    pages: [
      {
        id: "home",
        path: "/",
        title: businessName,
        description: tagline,
        sections: homeSections,
      },
    ],
    customGaps: [],
  };
}

export function normalizeSiteSpec(raw: unknown, prompt: string): SiteSpec {
  const fallback = defaultSiteSpec(prompt);
  if (!raw || typeof raw !== "object") return fallback;
  const o = raw as Record<string, unknown>;
  const layoutStyle = pick(o.layoutStyle ?? (o.theme as { layoutStyle?: unknown })?.layoutStyle, LAYOUT_STYLES, fallback.theme.layoutStyle);
  const industry = asString(o.industry, fallback.industry);
  const baseTheme = themeFromIndustry(industry, layoutStyle);
  const themeIn = (o.theme && typeof o.theme === "object" ? o.theme : {}) as Record<string, unknown>;
  const theme: SiteTheme = {
    ...baseTheme,
    primary: asString(themeIn.primary, baseTheme.primary),
    primaryForeground: asString(themeIn.primaryForeground, baseTheme.primaryForeground),
    accent: asString(themeIn.accent, baseTheme.accent),
    background: asString(themeIn.background, baseTheme.background),
    foreground: asString(themeIn.foreground, baseTheme.foreground),
    muted: asString(themeIn.muted, baseTheme.muted),
    mutedForeground: asString(themeIn.mutedForeground, baseTheme.mutedForeground),
    border: asString(themeIn.border, baseTheme.border),
    radius: asString(themeIn.radius, baseTheme.radius),
    fontDisplay: asString(themeIn.fontDisplay, baseTheme.fontDisplay),
    fontBody: asString(themeIn.fontBody, baseTheme.fontBody),
    spacingScale: pick(themeIn.spacingScale, ["compact", "comfortable", "airy"] as const, baseTheme.spacingScale),
    layoutStyle,
  };

  const pagesRaw = Array.isArray(o.pages) ? o.pages : fallback.pages;
  const pages: SitePage[] = pagesRaw.length
    ? pagesRaw.map((p, i) => {
        const page = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
        const sectionsRaw = Array.isArray(page.sections) ? page.sections : [];
        const sections: SiteSection[] = sectionsRaw.map((s, j) => {
          const sec = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
          const items = Array.isArray(sec.items)
            ? sec.items.map((it) => {
                const item = (it && typeof it === "object" ? it : {}) as Record<string, unknown>;
                return {
                  title: asString(item.title, "Item"),
                  body: asString(item.body) || undefined,
                  meta: asString(item.meta) || undefined,
                };
              })
            : undefined;
          return {
            id: asString(sec.id, `section-${j}`),
            kind: pick(
              sec.kind,
              [
                "services",
                "features",
                "stats",
                "process",
                "testimonials",
                "gallery",
                "faq",
                "cta",
                "form",
                "trust",
              ] as const,
              "features",
            ),
            variant: pick(
              sec.variant,
              [
                "grid-3",
                "grid-2",
                "alternating",
                "strip",
                "cards",
                "accordion",
                "carousel-static",
                "split",
                "centered",
                "logo-row",
              ] as const,
              "grid-3",
            ),
            eyebrow: asString(sec.eyebrow) || undefined,
            title: asString(sec.title, "Section"),
            body: asString(sec.body) || undefined,
            items,
            ctaLabel: asString(sec.ctaLabel) || undefined,
            ctaHref: asString(sec.ctaHref) || undefined,
            imageSlot: asString(sec.imageSlot) || undefined,
          };
        });
        return {
          id: asString(page.id, i === 0 ? "home" : `page-${i}`),
          path: asString(page.path, i === 0 ? "/" : `/${asString(page.id, `page-${i}`)}`),
          title: asString(page.title, fallback.businessName),
          description: asString(page.description) || undefined,
          sections: sections.length ? sections : fallback.pages[0]!.sections,
        };
      })
    : fallback.pages;

  // Ensure home exists and has enough sections for a finished feel.
  let home = pages.find((p) => p.path === "/" || p.id === "home") ?? pages[0]!;
  if (home.sections.length < 5) {
    const extras = fallback.pages[0]!.sections.slice(home.sections.length);
    home = { ...home, sections: [...home.sections, ...extras].slice(0, 8) };
  }
  const otherPages = pages.filter((p) => p !== home);
  const normalizedPages = [home, ...otherPages].slice(0, 5);

  const nav = Array.isArray(o.nav)
    ? o.nav
        .map((n) => {
          const item = (n && typeof n === "object" ? n : {}) as Record<string, unknown>;
          return { label: asString(item.label), href: asString(item.href) };
        })
        .filter((n) => n.label && n.href)
    : fallback.nav;

  const ctaPrimaryIn = (o.ctaPrimary && typeof o.ctaPrimary === "object" ? o.ctaPrimary : {}) as Record<string, unknown>;
  const ctaSecondaryIn = (o.ctaSecondary && typeof o.ctaSecondary === "object" ? o.ctaSecondary : null) as Record<string, unknown> | null;
  const gaps = Array.isArray(o.customGaps)
    ? o.customGaps.map((g) => asString(g)).filter(Boolean)
    : [];

  return {
    businessName: asString(o.businessName, fallback.businessName),
    tagline: asString(o.tagline, fallback.tagline),
    industry,
    intent: asString(o.intent, prompt.slice(0, 280)),
    phone: asString(o.phone, fallback.phone),
    email: asString(o.email, fallback.email),
    location: asString(o.location, fallback.location),
    ctaPrimary: {
      label: asString(ctaPrimaryIn.label, fallback.ctaPrimary.label),
      href: asString(ctaPrimaryIn.href, fallback.ctaPrimary.href),
    },
    ctaSecondary: ctaSecondaryIn
      ? {
          label: asString(ctaSecondaryIn.label, "Learn more"),
          href: asString(ctaSecondaryIn.href, "#services"),
        }
      : fallback.ctaSecondary,
    nav: nav.length ? nav : fallback.nav,
    headerVariant: pick(o.headerVariant, HEADER_VARIANTS, fallback.headerVariant),
    footerVariant: pick(o.footerVariant, FOOTER_VARIANTS, fallback.footerVariant),
    theme,
    pages: normalizedPages,
    customGaps: gaps,
  };
}

/** Hero variant encoded on the first section via items[0].title or imageSlot. */
export function resolveHeroVariant(section: SiteSection | undefined): HeroVariant {
  if (!section) return "split-copy-media";
  const fromSlot = asString(section.imageSlot).replace(/^hero-/, "");
  if ((HERO_VARIANTS as string[]).includes(fromSlot)) return fromSlot as HeroVariant;
  const fromItem = asString(section.items?.[0]?.title);
  if ((HERO_VARIANTS as string[]).includes(fromItem)) return fromItem as HeroVariant;
  if (section.variant === "centered") return "centered-bold";
  if (section.variant === "split") return "split-copy-media";
  return "editorial-left";
}
