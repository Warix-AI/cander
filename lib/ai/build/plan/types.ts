/**
 * Plan-first Build IR — ProjectSpec, BuildPlan, Research & Implementation manifests.
 * Pure types; safe for client + server. Not the live create spine until flag on.
 */

export type ProjectKind = "site" | "app";

export type ProjectSpec = {
  version: 1;
  kind: ProjectKind;
  businessName: string;
  tagline?: string;
  industry?: string;
  intent: string;
  audience?: string;
  goals: string[];
  ctas: Array<{ label: string; href?: string; primary?: boolean }>;
  constraints?: string[];
  tone?: string;
  location?: string;
  phone?: string;
  email?: string;
  /** App-reserved (Phase 6); ignored for sites. */
  auth?: {
    providers?: string[];
    recipeId?: string;
  };
  dataModel?: {
    entities?: Array<{ name: string; fields?: string[] }>;
  };
  apis?: Array<{ name: string; method?: string; path?: string }>;
  screens?: Array<{ id: string; title: string; route?: string }>;
  workflows?: Array<{ id: string; title: string; steps?: string[] }>;
  permissions?: Array<{ role: string; actions?: string[] }>;
};

export type BuildPlanComponentNeed = {
  role: string;
  designIntent: string;
  pageId?: string;
  sectionId?: string;
  required?: boolean;
};

export type BuildPlanJson = {
  version: 1;
  kind: "site";
  sitemap: Array<{ id: string; path: string; title: string; purpose?: string }>;
  pages: Array<{
    id: string;
    path: string;
    title: string;
    description?: string;
    sections: Array<{
      id: string;
      role: string;
      title?: string;
      purpose?: string;
    }>;
  }>;
  nav: Array<{ label: string; href: string }>;
  ctaStrategy?: {
    primary?: { label: string; href: string };
    secondary?: { label: string; href: string };
  };
  designSystem?: {
    layoutStyle?: string;
    typography?: string;
    colorMood?: string;
    notes?: string;
  };
  componentNeeds: BuildPlanComponentNeed[];
  interactions?: string[];
  contentNotes?: string[];
  seo?: { titleTemplate?: string; description?: string };
  assets?: string[];
  forms?: Array<{ id: string; fields?: string[]; action?: string }>;
  validationChecklist: string[];
};

/** Private plan envelope — markdown stays in DB, not customer git. */
export type BuildPlanRecord = {
  version: 1;
  markdown: string;
  json: BuildPlanJson;
  updatedAt?: string;
};

export type ResearchCandidate = {
  id: string;
  name?: string;
  score: number;
  reasons: string[];
  source?: "twenty_first" | "catalog" | "alt_component";
  deps?: string[];
};

export type ResearchRoleEntry = {
  role: string;
  designIntent: string;
  queries: string[];
  candidates: ResearchCandidate[];
  selected?: ResearchCandidate | null;
  rejected: Array<{ id: string; reason: string }>;
  fallback: "catalog" | "alt_component" | "none";
  deps: string[];
  primitives: string[];
  assets: string[];
  config: string[];
};

export type ResearchManifest = {
  version: 1;
  roles: ResearchRoleEntry[];
  packageDependencies: Record<string, string>;
  updatedAt?: string;
};

export type ImplementationValidation = {
  ok: boolean;
  technical: string[];
  visual: string[];
  repairedAt?: string;
};

export type ImplementationManifest = {
  version: 1;
  files: Array<{ path: string; role?: string }>;
  packageJson?: Record<string, unknown>;
  routes: Array<{ path: string; pageId?: string }>;
  tasks: string[];
  validation: ImplementationValidation;
  updatedAt?: string;
};

export type PlanFirstArtifacts = {
  projectSpec: ProjectSpec | null;
  buildPlan: BuildPlanRecord | null;
  researchManifest: ResearchManifest | null;
  implementationManifest: ImplementationManifest | null;
};

export function emptyImplementationValidation(): ImplementationValidation {
  return { ok: false, technical: [], visual: [] };
}

export function emptyImplementationManifest(): ImplementationManifest {
  return {
    version: 1,
    files: [],
    routes: [],
    tasks: [],
    validation: emptyImplementationValidation(),
  };
}
