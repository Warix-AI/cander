/**
 * Keep BuildPlan nav and SiteSpec pages/files in sync so validation can pass
 * in one shot. Landing briefs use hash nav; multi-page expands SiteSpec pages.
 *
 * Pure relative imports — safe for node:test without path aliases.
 */

import type { BuildPlanJson } from "./plan/types.ts";
import { navHrefRoutePath } from "./plan/nav-href.ts";
import { ensureNavRoutes } from "./plan/heuristics.ts";
import type { SiteSpec, SitePage, SiteSection } from "./site-spec.ts";
import type { WebsiteSetupBrief } from "./website-setup-brief.ts";

function slugFromLabelOrPath(label: string, path: string): string {
  const fromPath = path.replace(/^\//, "").replace(/\/+/g, "-").trim();
  if (fromPath) return fromPath.slice(0, 48);
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "section"
  );
}

function isLandingIntent(
  brief: WebsiteSetupBrief | null | undefined,
  spec: SiteSpec,
  content: string,
  plan?: BuildPlanJson,
): boolean {
  const depth = String(brief?.answers?.site_depth || "").toLowerCase();
  if (depth === "landing") return true;
  if (depth === "multi" || depth === "small") return false;
  if (/\bsingle\s+landing\s+page\b|\ba single landing page\b/i.test(content)) {
    return true;
  }
  const planExtra =
    plan?.pages?.filter((p) => (p.path || "/") !== "/").length ?? 0;
  if (planExtra >= 2) return false;
  const realPages = spec.pages.filter((p) => (p.path || "/") !== "/");
  return spec.pages.length <= 1 || realPages.length === 0;
}

function ensureHomeSection(
  home: SitePage,
  id: string,
  title: string,
): SitePage {
  if (home.sections.some((s) => s.id === id)) return home;
  const kind: SiteSection["kind"] =
    id === "contact" || /contact|order/i.test(title)
      ? "form"
      : id === "menu" || /menu|service/i.test(title)
        ? "services"
        : "features";
  const section: SiteSection = {
    id,
    kind,
    variant: kind === "form" ? "centered" : "grid-3",
    title,
    body: `${title} details.`,
  };
  return { ...home, sections: [...home.sections, section] };
}

/**
 * Align plan + SiteSpec so composeSiteFromSpec produces files that satisfy
 * validateNavRoutesAgainstFiles(plan, files).
 */
export function reconcilePlanNavWithSiteSpec(opts: {
  plan: BuildPlanJson;
  spec: SiteSpec;
  brief?: WebsiteSetupBrief | null;
  userContent?: string;
}): { plan: BuildPlanJson; spec: SiteSpec; mode: "landing" | "multipage" } {
  const content = opts.userContent || "";
  let plan = ensureNavRoutes(opts.plan);
  let spec = opts.spec;

  if (isLandingIntent(opts.brief, spec, content, plan)) {
    const homeIdx = Math.max(
      0,
      spec.pages.findIndex((p) => p.path === "/" || p.id === "home"),
    );
    let home = spec.pages[homeIdx] ?? {
      id: "home",
      path: "/",
      title: spec.businessName || "Home",
      sections: [],
    };

    const nextNav = plan.nav.map((item) => {
      const route = navHrefRoutePath(item.href);
      if (!route || route === "/") {
        const hash = item.href.includes("#")
          ? item.href.slice(item.href.indexOf("#") + 1)
          : "";
        if (hash) home = ensureHomeSection(home, hash, item.label);
        return item;
      }
      const id = slugFromLabelOrPath(item.label, route);
      home = ensureHomeSection(home, id, item.label);
      return { ...item, href: `/#${id}` };
    });

    const nextSpecNav = (spec.nav.length ? spec.nav : nextNav).map((item) => {
      const route = navHrefRoutePath(item.href);
      if (!route || route === "/") return item;
      const id = slugFromLabelOrPath(item.label, route);
      home = ensureHomeSection(home, id, item.label);
      return { ...item, href: `/#${id}` };
    });

    plan = {
      ...plan,
      nav: nextNav,
      sitemap: [{ id: "home", path: "/", title: home.title || "Home" }],
      pages: [
        {
          id: "home",
          path: "/",
          title: home.title || "Home",
          sections: home.sections.map((s) => ({
            id: s.id,
            role: s.kind,
            title: s.title,
            purpose: s.body || s.title,
          })),
        },
      ],
    };

    const ctaRoute = navHrefRoutePath(spec.ctaPrimary.href);
    spec = {
      ...spec,
      nav: nextSpecNav.length ? nextSpecNav : nextNav,
      pages: [home],
      ctaPrimary: {
        ...spec.ctaPrimary,
        href:
          ctaRoute && ctaRoute !== "/"
            ? `/#${slugFromLabelOrPath(spec.ctaPrimary.label, ctaRoute)}`
            : spec.ctaPrimary.href,
      },
    };

    return { plan, spec, mode: "landing" };
  }

  const byPath = new Map(
    spec.pages.map((p) => [p.path.replace(/\/$/, "") || "/", p]),
  );
  for (const page of plan.pages) {
    const path = page.path.replace(/\/$/, "") || "/";
    if (byPath.has(path)) continue;
    const stub: SitePage = {
      id: page.id,
      path: page.path,
      title: page.title,
      description: page.description,
      sections: (page.sections || []).map((s) => ({
        id: s.id,
        kind:
          s.role === "form"
            ? "form"
            : s.role === "services"
              ? "services"
              : "features",
        variant: "grid-3",
        title: s.title || page.title,
        body: s.purpose || "",
      })),
    };
    if (!stub.sections.length) {
      stub.sections = [
        {
          id: `${page.id}-main`,
          kind: "features",
          variant: "split",
          title: page.title,
          body: page.description || `${page.title} page.`,
        },
      ];
    }
    byPath.set(path, stub);
  }

  const home =
    byPath.get("/") ||
    spec.pages.find((p) => p.path === "/") ||
    spec.pages[0]!;
  const rest = [...byPath.values()].filter((p) => p.path !== home.path);
  spec = {
    ...spec,
    nav: plan.nav.map((n) => ({ label: n.label, href: n.href })),
    pages: [home, ...rest].slice(0, 8),
  };

  return { plan, spec, mode: "multipage" };
}
