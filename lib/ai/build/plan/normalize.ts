/**
 * Normalize / validate plan-first JSON blobs from DB or API.
 */

import type {
  BuildPlanJson,
  BuildPlanRecord,
  ImplementationManifest,
  ProjectSpec,
  ProjectSpecDecision,
  ResearchManifest,
} from "./types.ts";
import { emptyImplementationManifest } from "./types.ts";
import { navHrefRoutePath } from "./nav-href.ts";

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

export function normalizeProjectSpec(raw: unknown): ProjectSpec | null {
  const o = asRecord(raw);
  if (!o) return null;
  const kind = o.kind === "app" ? "app" : o.kind === "site" ? "site" : null;
  if (!kind) return null;
  const businessName = asString(o.businessName).trim();
  const intent = asString(o.intent).trim();
  if (!businessName || !intent) return null;
  return {
    version: 1,
    kind,
    businessName,
    tagline: asString(o.tagline) || undefined,
    industry: asString(o.industry) || undefined,
    intent,
    audience: asString(o.audience) || undefined,
    goals: asStringArray(o.goals),
    ctas: Array.isArray(o.ctas)
      ? o.ctas
          .map((c) => asRecord(c))
          .filter(Boolean)
          .map((c) => ({
            label: asString(c!.label),
            href: asString(c!.href) || undefined,
            primary: Boolean(c!.primary),
          }))
          .filter((c) => c.label)
      : [],
    constraints: asStringArray(o.constraints),
    tone: asString(o.tone) || undefined,
    location: asString(o.location) || undefined,
    phone: asString(o.phone) || undefined,
    email: asString(o.email) || undefined,
    auth: asRecord(o.auth)
      ? {
          providers: asStringArray(asRecord(o.auth)!.providers),
          recipeId: asString(asRecord(o.auth)!.recipeId) || undefined,
        }
      : undefined,
    dataModel: asRecord(o.dataModel)
      ? {
          entities: Array.isArray(asRecord(o.dataModel)!.entities)
            ? (asRecord(o.dataModel)!.entities as unknown[])
                .map((e) => asRecord(e))
                .filter(Boolean)
                .map((e) => ({
                  name: asString(e!.name),
                  fields: asStringArray(e!.fields),
                }))
                .filter((e) => e.name)
            : [],
        }
      : undefined,
    apis: Array.isArray(o.apis)
      ? o.apis
          .map((a) => asRecord(a))
          .filter(Boolean)
          .map((a) => ({
            name: asString(a!.name),
            method: asString(a!.method) || undefined,
            path: asString(a!.path) || undefined,
          }))
          .filter((a) => a.name)
      : undefined,
    screens: Array.isArray(o.screens)
      ? o.screens
          .map((s) => asRecord(s))
          .filter(Boolean)
          .map((s) => ({
            id: asString(s!.id),
            title: asString(s!.title),
            route: asString(s!.route) || undefined,
          }))
          .filter((s) => s.id && s.title)
      : undefined,
    workflows: Array.isArray(o.workflows)
      ? o.workflows
          .map((w) => asRecord(w))
          .filter(Boolean)
          .map((w) => ({
            id: asString(w!.id),
            title: asString(w!.title),
            steps: asStringArray(w!.steps),
          }))
          .filter((w) => w.id && w.title)
      : undefined,
    permissions: Array.isArray(o.permissions)
      ? o.permissions
          .map((p) => asRecord(p))
          .filter(Boolean)
          .map((p) => ({
            role: asString(p!.role),
            actions: asStringArray(p!.actions),
          }))
          .filter((p) => p.role)
      : undefined,
    ...normalizeProjectSpecMemory(o),
  };
}

function asStringMap(v: unknown): Record<string, string | undefined> | undefined {
  const r = asRecord(v);
  if (!r) return undefined;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(r)) {
    if (typeof val === "string" && val.trim()) out[k] = val;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Durable-memory fields; all optional so legacy rows keep validating. */
function normalizeProjectSpecMemory(o: Record<string, unknown>): Partial<ProjectSpec> {
  const out: Partial<ProjectSpec> = {};
  if (Array.isArray(o.pages)) {
    const pages = o.pages
      .map((p) => asRecord(p))
      .filter(Boolean)
      .map((p) => ({
        path: asString(p!.path),
        title: asString(p!.title),
        purpose: asString(p!.purpose) || undefined,
      }))
      .filter((p) => p.path.startsWith("/") && p.title);
    if (pages.length) out.pages = pages;
  }
  const features = asStringArray(o.features);
  if (features.length) out.features = features;
  const visual = asRecord(o.visual);
  if (visual) {
    const typography = asRecord(visual.typography);
    const components = asRecord(visual.components);
    const v: NonNullable<ProjectSpec["visual"]> = {
      direction: asString(visual.direction) || undefined,
      palette: asStringMap(visual.palette),
      typography: typography
        ? {
            display: asString(typography.display) || undefined,
            body: asString(typography.body) || undefined,
            scale: asString(typography.scale) || undefined,
          }
        : undefined,
      components: components
        ? {
            radius: asString(components.radius) || undefined,
            shadow: asString(components.shadow) || undefined,
            density: asString(components.density) || undefined,
            buttons: asString(components.buttons) || undefined,
            cards: asString(components.cards) || undefined,
            nav: asString(components.nav) || undefined,
          }
        : undefined,
      layout: asString(visual.layout) || undefined,
      mood: asStringArray(visual.mood),
    };
    if (!v.mood?.length) delete v.mood;
    out.visual = v;
  }
  if (Array.isArray(o.inspiration)) {
    const insp = o.inspiration
      .map((i) => asRecord(i))
      .filter(Boolean)
      .map((i) => ({ url: asString(i!.url), summary: asString(i!.summary) }))
      .filter((i) => i.url);
    if (insp.length) out.inspiration = insp;
  }
  const brand = asRecord(o.brand);
  if (brand) {
    const b: NonNullable<ProjectSpec["brand"]> = {};
    for (const k of ["logoPath", "faviconPath", "ogImagePath", "logoUrl", "faviconUrl", "ogImageUrl"] as const) {
      const val = asString(brand[k]);
      if (val) b[k] = val;
    }
    if (Object.keys(b).length) out.brand = b;
  }
  const technical = asStringArray(o.technical);
  if (technical.length) out.technical = technical;
  const userInstructions = asStringArray(o.userInstructions);
  if (userInstructions.length) out.userInstructions = userInstructions;
  if (Array.isArray(o.decisions)) {
    const decisions = o.decisions
      .map((d) => asRecord(d))
      .filter(Boolean)
      .map((d) => {
        const src = asString(d!.source);
        return {
          at: asString(d!.at) || new Date(0).toISOString(),
          summary: asString(d!.summary),
          source: (["setup", "planner", "user", "builder", "system"].includes(src)
            ? src
            : "system") as ProjectSpecDecision["source"],
        };
      })
      .filter((d) => d.summary);
    if (decisions.length) out.decisions = decisions.slice(-60);
  }
  const lastEditSummary = asString(o.lastEditSummary);
  if (lastEditSummary) out.lastEditSummary = lastEditSummary;
  if (Array.isArray(o.selectedComponents)) {
    const selected = o.selectedComponents
      .map((c) => asRecord(c))
      .filter(Boolean)
      .map((c) => ({
        source: (asString(c!.source) === "native" ? "native" : "21st") as "21st" | "native",
        componentId: asString(c!.componentId),
        name: asString(c!.name) || undefined,
        purpose: asString(c!.purpose) || "section",
        reason: asString(c!.reason) || undefined,
        adaptationInstructions: asString(c!.adaptationInstructions) || undefined,
        localPath: asString(c!.localPath) || undefined,
      }))
      .filter((c) => c.componentId);
    if (selected.length) out.selectedComponents = selected.slice(0, 12);
  }
  const imagery = asRecord(o.imagery);
  if (imagery) {
    const img: NonNullable<ProjectSpec["imagery"]> = {
      heroSubject: asString(imagery.heroSubject) || undefined,
      sectionSubjects: asStringArray(imagery.sectionSubjects),
      avoid: asStringArray(imagery.avoid),
    };
    if (!img.sectionSubjects?.length) delete img.sectionSubjects;
    if (!img.avoid?.length) delete img.avoid;
    if (img.heroSubject || img.sectionSubjects || img.avoid) out.imagery = img;
  }
  if (Array.isArray(o.primaryFlows)) {
    const flows = o.primaryFlows
      .map((f) => asRecord(f))
      .filter(Boolean)
      .map((f) => ({
        id: asString(f!.id),
        title: asString(f!.title),
        steps: asStringArray(f!.steps),
      }))
      .filter((f) => f.id && f.title);
    if (flows.length) out.primaryFlows = flows.slice(0, 12);
  }
  const updatedAt = asString(o.updatedAt);
  if (updatedAt) out.updatedAt = updatedAt;
  return out;
}

export function normalizeBuildPlanJson(raw: unknown): BuildPlanJson | null {
  const o = asRecord(raw);
  if (!o) return null;
  const sitemap = Array.isArray(o.sitemap)
    ? o.sitemap
        .map((p) => asRecord(p))
        .filter(Boolean)
        .map((p) => ({
          id: asString(p!.id),
          path: asString(p!.path),
          title: asString(p!.title),
          purpose: asString(p!.purpose) || undefined,
        }))
        .filter((p) => p.id && p.path)
    : [];
  const pages = Array.isArray(o.pages)
    ? o.pages
        .map((p) => asRecord(p))
        .filter(Boolean)
        .map((p) => ({
          id: asString(p!.id),
          path: asString(p!.path),
          title: asString(p!.title),
          description: asString(p!.description) || undefined,
          sections: Array.isArray(p!.sections)
            ? p!.sections
                .map((s) => asRecord(s))
                .filter(Boolean)
                .map((s) => ({
                  id: asString(s!.id),
                  role: asString(s!.role),
                  title: asString(s!.title) || undefined,
                  purpose: asString(s!.purpose) || undefined,
                }))
                .filter((s) => s.id && s.role)
            : [],
        }))
        .filter((p) => p.id && p.path)
    : [];
  const nav = Array.isArray(o.nav)
    ? o.nav
        .map((n) => asRecord(n))
        .filter(Boolean)
        .map((n) => ({
          label: asString(n!.label),
          href: asString(n!.href),
        }))
        .filter((n) => n.label && n.href)
    : [];
  const componentNeeds = Array.isArray(o.componentNeeds)
    ? o.componentNeeds
        .map((c) => asRecord(c))
        .filter(Boolean)
        .map((c) => ({
          role: asString(c!.role),
          designIntent: asString(c!.designIntent),
          pageId: asString(c!.pageId) || undefined,
          sectionId: asString(c!.sectionId) || undefined,
          required: c!.required === undefined ? true : Boolean(c!.required),
        }))
        .filter((c) => c.role && c.designIntent)
    : [];
  if (sitemap.length === 0 && pages.length === 0) return null;
  return {
    version: 1,
    kind: "site",
    sitemap: sitemap.length ? sitemap : pages.map((p) => ({
      id: p.id,
      path: p.path,
      title: p.title,
    })),
    pages,
    nav,
    ctaStrategy: asRecord(o.ctaStrategy)
      ? {
          primary: asRecord(asRecord(o.ctaStrategy)!.primary)
            ? {
                label: asString(
                  asRecord(asRecord(o.ctaStrategy)!.primary)!.label,
                ),
                href: asString(
                  asRecord(asRecord(o.ctaStrategy)!.primary)!.href,
                ),
              }
            : undefined,
          secondary: asRecord(asRecord(o.ctaStrategy)!.secondary)
            ? {
                label: asString(
                  asRecord(asRecord(o.ctaStrategy)!.secondary)!.label,
                ),
                href: asString(
                  asRecord(asRecord(o.ctaStrategy)!.secondary)!.href,
                ),
              }
            : undefined,
        }
      : undefined,
    designSystem: asRecord(o.designSystem)
      ? {
          layoutStyle: asString(asRecord(o.designSystem)!.layoutStyle) || undefined,
          typography: asString(asRecord(o.designSystem)!.typography) || undefined,
          colorMood: asString(asRecord(o.designSystem)!.colorMood) || undefined,
          notes: asString(asRecord(o.designSystem)!.notes) || undefined,
        }
      : undefined,
    componentNeeds,
    interactions: asStringArray(o.interactions),
    contentNotes: asStringArray(o.contentNotes),
    seo: asRecord(o.seo)
      ? {
          titleTemplate: asString(asRecord(o.seo)!.titleTemplate) || undefined,
          description: asString(asRecord(o.seo)!.description) || undefined,
        }
      : undefined,
    assets: asStringArray(o.assets),
    forms: Array.isArray(o.forms)
      ? o.forms
          .map((f) => asRecord(f))
          .filter(Boolean)
          .map((f) => ({
            id: asString(f!.id),
            fields: asStringArray(f!.fields),
            action: asString(f!.action) || undefined,
          }))
          .filter((f) => f.id)
      : [],
    validationChecklist: asStringArray(o.validationChecklist),
  };
}

export function normalizeBuildPlanRecord(raw: unknown): BuildPlanRecord | null {
  const o = asRecord(raw);
  if (!o) return null;
  const json = normalizeBuildPlanJson(o.json ?? o);
  if (!json) return null;
  return {
    version: 1,
    markdown: asString(o.markdown),
    json,
    updatedAt: asString(o.updatedAt) || undefined,
  };
}

export function normalizeResearchManifest(raw: unknown): ResearchManifest | null {
  const o = asRecord(raw);
  if (!o) return null;
  const roles = Array.isArray(o.roles)
    ? o.roles
        .map((r) => asRecord(r))
        .filter(Boolean)
        .map((r) => ({
          role: asString(r!.role),
          designIntent: asString(r!.designIntent),
          queries: asStringArray(r!.queries),
          candidates: Array.isArray(r!.candidates)
            ? r!.candidates
                .map((c) => asRecord(c))
                .filter(Boolean)
                .map((c) => ({
                  id: asString(c!.id),
                  name: asString(c!.name) || undefined,
                  score: typeof c!.score === "number" ? c!.score : 0,
                  reasons: asStringArray(c!.reasons),
                  source:
                    c!.source === "catalog" ||
                    c!.source === "alt_component" ||
                    c!.source === "twenty_first"
                      ? (c!.source as "twenty_first" | "catalog" | "alt_component")
                      : undefined,
                  deps: asStringArray(c!.deps),
                }))
                .filter((c) => c.id)
            : [],
          selected: asRecord(r!.selected)
            ? {
                id: asString(asRecord(r!.selected)!.id),
                name: asString(asRecord(r!.selected)!.name) || undefined,
                score:
                  typeof asRecord(r!.selected)!.score === "number"
                    ? (asRecord(r!.selected)!.score as number)
                    : 0,
                reasons: asStringArray(asRecord(r!.selected)!.reasons),
                source:
                  asRecord(r!.selected)!.source === "catalog" ||
                  asRecord(r!.selected)!.source === "alt_component" ||
                  asRecord(r!.selected)!.source === "twenty_first"
                    ? (asRecord(r!.selected)!.source as
                        | "twenty_first"
                        | "catalog"
                        | "alt_component")
                    : undefined,
              }
            : r!.selected === null
              ? null
              : undefined,
          rejected: Array.isArray(r!.rejected)
            ? r!.rejected
                .map((x) => asRecord(x))
                .filter(Boolean)
                .map((x) => ({
                  id: asString(x!.id),
                  reason: asString(x!.reason),
                }))
                .filter((x) => x.id && x.reason)
            : [],
          fallback:
            r!.fallback === "catalog" ||
            r!.fallback === "alt_component" ||
            r!.fallback === "none"
              ? (r!.fallback as "catalog" | "alt_component" | "none")
              : ("none" as const),
          deps: asStringArray(r!.deps),
          primitives: asStringArray(r!.primitives),
          assets: asStringArray(r!.assets),
          config: asStringArray(r!.config),
        }))
        .filter((r) => r.role) as import("./types.ts").ResearchRoleEntry[]
    : [];
  const packageDependencies =
    asRecord(o.packageDependencies) ?? ({} as Record<string, unknown>);
  const deps: Record<string, string> = {};
  for (const [k, v] of Object.entries(packageDependencies)) {
    if (typeof v === "string" && k) deps[k] = v;
  }
  return {
    version: 1,
    roles,
    packageDependencies: deps,
    updatedAt: asString(o.updatedAt) || undefined,
  };
}

export function normalizeImplementationManifest(
  raw: unknown,
): ImplementationManifest {
  const o = asRecord(raw);
  if (!o) return emptyImplementationManifest();
  const validation = asRecord(o.validation);
  return {
    version: 1,
    files: Array.isArray(o.files)
      ? o.files
          .map((f) => {
            if (typeof f === "string") return { path: f };
            const r = asRecord(f);
            if (!r) return null;
            const path = asString(r.path);
            if (!path) return null;
            return { path, role: asString(r.role) || undefined };
          })
          .filter((f): f is { path: string; role?: string } => Boolean(f))
      : [],
    packageJson: asRecord(o.packageJson) ?? undefined,
    routes: Array.isArray(o.routes)
      ? o.routes
          .map((r) => asRecord(r))
          .filter(Boolean)
          .map((r) => ({
            path: asString(r!.path),
            pageId: asString(r!.pageId) || undefined,
          }))
          .filter((r) => r.path)
      : [],
    tasks: asStringArray(o.tasks),
    validation: {
      ok: Boolean(validation?.ok),
      technical: asStringArray(validation?.technical),
      visual: asStringArray(validation?.visual),
      repairedAt: asString(validation?.repairedAt) || undefined,
    },
    updatedAt: asString(o.updatedAt) || undefined,
  };
}

/** Every nav href must appear in sitemap/pages paths. */
export function assertNavCoveredBySitemap(plan: BuildPlanJson): string[] {
  const paths = new Set(
    [...plan.sitemap, ...plan.pages].map((p) => p.path.replace(/\/$/, "") || "/"),
  );
  const issues: string[] = [];
  for (const item of plan.nav) {
    const routePath = navHrefRoutePath(item.href);
    if (!routePath) continue;
    if (!paths.has(routePath)) {
      issues.push(`Nav href ${item.href} has no sitemap/page entry.`);
    }
  }
  return issues;
}
