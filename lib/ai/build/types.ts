/**
 * Build IR — product intent (BuildSpec) vs attempt observations.
 * Pure types; safe for local + Edge import. Not answer-format schema.
 */

export type BuildProjectType =
  | "site"
  | "app"
  | "dashboard"
  | "automation"
  | "unknown";

export type BuildTaskComplexity = "routine" | "moderate" | "complex";

export type BuildDesignTokens = {
  theme?: string;
  style?: string;
  colors?: Record<string, string>;
  typography?: Record<string, string>;
  spacing?: Record<string, string>;
  radius?: string;
  shadows?: Record<string, string>;
  containerWidths?: Record<string, string>;
  references?: string[];
};

export type BuildPage = {
  id: string;
  route: string;
  title: string;
  sectionIds?: string[];
};

export type BuildSection = {
  id: string;
  role: string;
  pageId?: string;
  componentId?: string;
  content?: Record<string, unknown>;
};

export type BuildComponentRef = {
  id: string;
  role: string;
  source: "project" | "cander" | "twenty_first" | "composed" | "generated";
  providerId?: string;
  name?: string;
};

export type BuildAuthConfig = {
  recipeId?: string;
  recipeVersion?: number;
  providers?: string[];
  configured?: boolean;
};

export type BuildDataModel = {
  entities?: Array<{ name: string; fields?: string[] }>;
};

export type BuildIntegration = {
  id: string;
  kind: string;
  config?: Record<string, unknown>;
};

export type BuildAutomation = {
  id: string;
  kind: string;
  schedule?: string;
  config?: Record<string, unknown>;
};

export type BuildSeo = {
  title?: string;
  description?: string;
  sitemap?: boolean;
  structuredData?: boolean;
};

/** Canonical intended product state — no sandbox logs or retries. */
export type BuildSpec = {
  projectId: string;
  projectType: BuildProjectType;
  goal: string;
  audience?: string;
  requirements: string[];
  constraints: string[];
  design: BuildDesignTokens;
  pages: BuildPage[];
  sections: BuildSection[];
  components: BuildComponentRef[];
  dataModel?: BuildDataModel;
  auth?: BuildAuthConfig;
  integrations: BuildIntegration[];
  automations: BuildAutomation[];
  seo?: BuildSeo;
  files: string[];
  dependencies: string[];
  customRequirements: string[];
  recipeId?: string;
  recipeVersion?: number;
  /** Monotonic validated-draft version. */
  buildSpecVersion: number;
  parentVersion: number | null;
  createdAt: string;
  updatedAt: string;
};

export type BuildSpecPath = string;

/** Typed patch — apply only after validation succeeds. */
export type BuildSpecDelta = {
  set?: Array<{ path: BuildSpecPath; value: unknown }>;
  remove?: Array<{ path: BuildSpecPath }>;
  append?: Array<{ path: BuildSpecPath; value: unknown }>;
  replace?: Array<{ path: BuildSpecPath; from?: unknown; to: unknown }>;
};

export type SandboxSessionStatus =
  | "none"
  | "starting"
  | "active"
  | "idle"
  | "error"
  | "stopped";

/** Outside BuildSpec — session lifecycle for a project. */
export type SandboxSessionRef = {
  projectId: string;
  sessionId: string | null;
  status: SandboxSessionStatus;
  lastUsedAt: string | null;
  previewUrl: string | null;
  /** BuildSpec version the sandbox was last synced to. */
  specVersion: number | null;
};

export type BuildCommandObservation = {
  command: string;
  args?: string[];
  exitCode: number;
  stdout?: string;
  stderr?: string;
  timedOut?: boolean;
};

export type BuildFileChange = {
  path: string;
  op: "write" | "patch" | "delete";
};

/** Attempt-scoped — what actually happened. */
export type BuildObservations = {
  attemptId: string;
  projectId: string;
  startedAt: string;
  finishedAt?: string;
  sandbox?: SandboxSessionRef;
  filesChanged: BuildFileChange[];
  commands: BuildCommandObservation[];
  previewUrl?: string | null;
  errors: string[];
  retryCount: number;
  currentStep?: string;
  toolsSelected: string[];
  toolsExecuted: string[];
};

export type CompletionCriterionResult = {
  id: string;
  passed: boolean;
  detail?: string;
};

export type BuildValidationState = {
  buildPassed: boolean;
  typecheckPassed: boolean;
  lintPassed: boolean;
  runtimePassed: boolean;
  criteria: CompletionCriterionResult[];
  allPassed: boolean;
};

/** Working attempt vs validated draft bookkeeping (not user-facing). */
export type BuildExecutionState = {
  projectId: string;
  /** Last successfully committed BuildSpec version. */
  validatedSpecVersion: number;
  workingAttemptId: string | null;
  observations: BuildObservations | null;
  validation: BuildValidationState | null;
  sandbox: SandboxSessionRef;
};

export type TurnPlanOperation =
  | { type: "spec.read" }
  | { type: "spec.patch"; deltaHint?: string }
  | { type: "component.search"; role: string; query?: string }
  | { type: "component.replace"; role: string; componentId?: string }
  | { type: "page.create"; route: string; title?: string }
  | { type: "page.remove"; route: string }
  | { type: "navigation.update" }
  | { type: "content.edit"; target: string }
  | { type: "style.edit"; target?: string }
  | { type: "recipe.apply"; recipeId: string }
  | { type: "auth.configure"; recipeId?: string }
  | { type: "dependencies.ensure" }
  | { type: "build.validate" }
  | { type: "preview.inspect" }
  | { type: "publish.gate" }
  | { type: "clarify"; reason: string };

export type CompletionCriterion = {
  id: string;
  kind:
    | "route_exists"
    | "nav_links"
    | "build_succeeds"
    | "typecheck_succeeds"
    | "no_runtime_errors"
    | "plans_render"
    | "spec_field"
    | "custom";
  /** Machine params (route, count, path, …). */
  params?: Record<string, unknown>;
  /** Logging only — runtime must not interpret prose. */
  label?: string;
};

export type TurnPlan = {
  objective: string;
  subject: { projectId: string | null };
  operations: TurnPlanOperation[];
  completionCriteria: CompletionCriterion[];
  complexity: BuildTaskComplexity;
  /** Pending delta to commit only after validation. */
  pendingDelta?: BuildSpecDelta | null;
  recipeId?: string;
  recipeVersion?: number;
  /** Logging / UI only. */
  label?: string;
  /** True when project identity is ambiguous. */
  needsClarification?: boolean;
  clarificationReason?: string;
};

export type BuildCapabilityResolution = {
  requiresBuildCapabilities: boolean;
  complexity: BuildTaskComplexity;
  reasons: string[];
};

export type ProjectResolveStatus =
  | "resolved"
  | "create"
  | "clarify"
  | "none";

export type ProjectResolveResult = {
  status: ProjectResolveStatus;
  projectId: string | null;
  reason: string;
  candidates?: Array<{ id: string; title: string }>;
};
