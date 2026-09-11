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

  // ---- durable project memory (website projects) ----------------------------
  /** Pages the site should have (kept in sync by the builder). */
  pages?: Array<{ path: string; title: string; purpose?: string }>;
  /** Product/site features the user asked for (forms, booking, blog…). */
  features?: string[];
  /** Visual direction and the component language the builder must honour. */
  visual?: ProjectVisualSpec;
  /** Summaries of inspiration sites the user pointed at. */
  inspiration?: Array<{ url: string; summary: string }>;
  /** Brand assets stored in the repo (public/...) or project-assets storage. */
  brand?: {
    logoPath?: string;
    faviconPath?: string;
    ogImagePath?: string;
    /** Public URLs when the assets live in storage rather than the repo. */
    logoUrl?: string;
    faviconUrl?: string;
    ogImageUrl?: string;
  };
  /** Technical conventions the codebase follows (fonts via <link>, tokens in globals.css…). */
  technical?: string[];
  /** Standing instructions from the user that apply to every future edit. */
  userInstructions?: string[];
  /** Lasting decisions log — newest last. */
  decisions?: ProjectSpecDecision[];
  /** Friendly summary of the most recent edit job. */
  lastEditSummary?: string;
  /**
   * 21st.dev (or other) components selected at plan time for the coder to adapt.
   * Code snippets may be truncated; full source is written under components/twenty-first/ when fetched.
   */
  selectedComponents?: Array<{
    source: "21st" | "native";
    componentId: string;
    name?: string;
    purpose: string;
    reason?: string;
    adaptationInstructions?: string;
    /** Repo-relative path when source was materialized for the coder. */
    localPath?: string;
    imported?: boolean;
    usedInRender?: boolean;
  }>;
  /** Imagery direction for heroes/sections (subjects, mood) — not raw URLs. */
  imagery?: {
    heroSubject?: string;
    sectionSubjects?: string[];
    avoid?: string[];
    strategy?: string;
    plan?: Array<{
      role: string;
      strategy: string;
      description: string;
      assetPath?: string;
    }>;
  };
  /**
   * Canonical design brief — authoritative design direction derived from
   * onboarding (not raw fragmented preferences).
   */
  designBrief?: {
    purpose?: string;
    audience?: string;
    primaryGoal?: string;
    contentDirection?: string;
    styleDirection?: string;
    colorDirection?: string;
    imageryStrategy?: string;
    referenceUrl?: string | null;
    designTokens?: Record<string, string>;
    imagery?: Array<{
      role: string;
      strategy: string;
      description: string;
      assetPath?: string;
    }>;
    avoid?: string[];
    builderFreedom?: string[];
    selectedComponents?: Array<Record<string, unknown>>;
    twentyFirstStats?: Record<string, unknown>;
    referenceTraits?: string[];
    strengths?: Record<string, string>;
    updatedAt?: string;
  };
  /** App: ordered primary user flows the create job should implement. */
  primaryFlows?: Array<{ id: string; title: string; steps?: string[] }>;
  updatedAt?: string;
};

export type ProjectVisualSpec = {
  direction?: string;
  palette?: {
    primary?: string;
    accent?: string;
    background?: string;
    foreground?: string;
    muted?: string;
    [key: string]: string | undefined;
  };
  typography?: { display?: string; body?: string; scale?: string };
  components?: {
    radius?: string;
    shadow?: string;
    density?: string;
    buttons?: string;
    cards?: string;
    nav?: string;
  };
  layout?: string;
  mood?: string[];
};

export type ProjectSpecDecision = {
  at: string;
  summary: string;
  /** Where the decision came from. */
  source: "setup" | "planner" | "user" | "builder" | "system";
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
