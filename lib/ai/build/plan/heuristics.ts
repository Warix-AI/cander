/**
 * Deterministic ProjectSpec / BuildPlan heuristics (no LLM).
 * Pure modules — safe for node:test without path aliases.
 */

import type {
  BuildPlanJson,
  BuildPlanRecord,
  ProjectSpec,
} from "./types.ts";
import { renderBuildPlanMarkdown } from "./markdown.ts";
import { assertNavCoveredBySitemap } from "./normalize.ts";

export function projectSpecFromBriefHeuristic(
  brief: {
    answers?: Record<string, unknown>;
  } | null | undefined,
  userContent: string,
): ProjectSpec {
  const a = brief?.answers ?? {};
  const businessName =
    String(a.business_name || a.businessName || a.name || "").trim() ||
    "New business";
  const intent =
    String(a.intent || a.goal || a.purpose || userContent || "")
      .trim()
      .slice(0, 500) || "Marketing website";
  const industry = String(a.industry || a.category || "").trim() || undefined;
  const audience = String(a.audience || a.customers || "").trim() || undefined;
  const tagline = String(a.tagline || a.slogan || "").trim() || undefined;
  const location = String(a.location || a.city || "").trim() || undefined;
  const phone = String(a.phone || "").trim() || undefined;
  const email = String(a.email || "").trim() || undefined;
  const ctaLabel =
    String(a.cta || a.primary_cta || "Get in touch").trim() || "Get in touch";

  return {
    version: 1,
    kind: "site",
    businessName,
    tagline,
    industry,
    intent,
    audience,
    goals: [
      String(a.primary_goal || intent).trim() || intent,
      ...String(a.secondary_goals || "")
        .split(/[,;\n]/)
        .map((s) => s.trim())
        .filter(Boolean),
    ].slice(0, 6),
    ctas: [{ label: ctaLabel, href: "/contact", primary: true }],
    constraints: String(a.constraints || "")
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean),
    tone: String(a.tone || a.vibe || "").trim() || undefined,
    location,
    phone,
    email,
  };
}

function ensureNavRoutes(plan: BuildPlanJson): BuildPlanJson {
  const pathSet = new Set(
    [...plan.sitemap, ...plan.pages].map((p) => p.path.replace(/\/$/, "") || "/"),
  );
  const pages = [...plan.pages];
  const sitemap = [...plan.sitemap];
  for (const item of plan.nav) {
    const href = item.href.replace(/\/$/, "") || "/";
    if (href.startsWith("#") || href.startsWith("http")) continue;
    if (pathSet.has(href)) continue;
    const id = href.replace(/^\//, "").replace(/\//g, "-") || "home";
    const title = item.label || id;
    const path =
      href === "" ? "/" : item.href.startsWith("/") ? item.href : `/${item.href}`;
    pages.push({
      id,
      path,
      title,
      sections: [
        {
          id: `${id}-main`,
          role: id === "contact" ? "form" : "features",
          title,
          purpose: `Page for ${title}`,
        },
      ],
    });
    sitemap.push({ id, path, title });
    pathSet.add(href);
  }
  return { ...plan, pages, sitemap };
}

function defaultPlanFromSpec(spec: ProjectSpec): BuildPlanJson {
  const homeSections = [
    {
      id: "hero",
      role: "hero",
      title: spec.tagline || spec.businessName,
      purpose: "Primary value proposition",
    },
    {
      id: "services",
      role: "services",
      title: "Services",
      purpose: "What you offer",
    },
    {
      id: "faq",
      role: "faq",
      title: "FAQ",
      purpose: "Common questions",
    },
    {
      id: "cta",
      role: "cta",
      title: spec.ctas[0]?.label || "Get in touch",
      purpose: "Conversion",
    },
  ];
  const designIntentBase = [
    spec.tone,
    spec.industry,
    "marketing site",
    spec.audience,
  ]
    .filter(Boolean)
    .join(" · ");

  const plan: BuildPlanJson = {
    version: 1,
    kind: "site",
    sitemap: [
      { id: "home", path: "/", title: "Home" },
      { id: "about", path: "/about", title: "About" },
      { id: "services", path: "/services", title: "Services" },
      { id: "contact", path: "/contact", title: "Contact" },
    ],
    pages: [
      {
        id: "home",
        path: "/",
        title: "Home",
        description: spec.intent,
        sections: homeSections,
      },
      {
        id: "about",
        path: "/about",
        title: "About",
        sections: [
          {
            id: "about-story",
            role: "features",
            title: "Our story",
            purpose: "Trust and background",
          },
        ],
      },
      {
        id: "services",
        path: "/services",
        title: "Services",
        sections: [
          {
            id: "services-grid",
            role: "services",
            title: "What we do",
            purpose: "Service detail",
          },
        ],
      },
      {
        id: "contact",
        path: "/contact",
        title: "Contact",
        sections: [
          {
            id: "contact-form",
            role: "form",
            title: "Contact",
            purpose: "Lead capture",
          },
        ],
      },
    ],
    nav: [
      { label: "Home", href: "/" },
      { label: "About", href: "/about" },
      { label: "Services", href: "/services" },
      { label: "Contact", href: "/contact" },
    ],
    ctaStrategy: {
      primary: {
        label: spec.ctas[0]?.label || "Contact",
        href: spec.ctas[0]?.href || "/contact",
      },
    },
    designSystem: {
      layoutStyle: "warm-local",
      colorMood: designIntentBase || "warm local marketing",
      notes: spec.intent,
    },
    componentNeeds: [
      {
        role: "hero",
        designIntent: `${designIntentBase || "warm local marketing"} hero`,
        pageId: "home",
        sectionId: "hero",
        required: true,
      },
      {
        role: "services",
        designIntent: `${designIntentBase || "warm local marketing"} services grid`,
        pageId: "home",
        sectionId: "services",
        required: true,
      },
      {
        role: "faq",
        designIntent: `${designIntentBase || "warm local marketing"} faq accordion`,
        pageId: "home",
        sectionId: "faq",
        required: true,
      },
      {
        role: "form",
        designIntent: `${designIntentBase || "warm local marketing"} contact form`,
        pageId: "contact",
        sectionId: "contact-form",
        required: true,
      },
    ],
    validationChecklist: [
      "Every nav href has a page",
      "package.json includes next",
      "Primary CTA reachable",
    ],
  };
  return ensureNavRoutes(plan);
}

export function buildPlanFromSpecHeuristic(spec: ProjectSpec): BuildPlanRecord {
  let json = defaultPlanFromSpec(spec);
  let issues = assertNavCoveredBySitemap(json);
  if (issues.length) {
    json = ensureNavRoutes(json);
    issues = assertNavCoveredBySitemap(json);
  }
  return {
    version: 1,
    markdown: renderBuildPlanMarkdown(json),
    json,
    updatedAt: new Date().toISOString(),
  };
}

export { ensureNavRoutes };
