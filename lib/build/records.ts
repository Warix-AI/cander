/**
 * Row shapes for the project-architecture tables added in
 * `20260911000000_project_architecture_foundation.sql`. One place for the
 * enums so server code, API routes and UI agree on the state machines.
 */

/** Per-provider provisioning state (projects.github_status / vercel_status). */
export type ProviderStatus = "not_created" | "creating" | "ready" | "failed";

export type ProjectFramework =
  | "nextjs"
  | "vite"
  | "astro"
  | "remix"
  | "sveltekit"
  | "nuxt"
  | "static";

/** Infra identity columns on `projects` (all nullable until provisioned). */
export interface ProjectInfraRecord {
  id: string;
  workspace_id: string;
  framework: ProjectFramework;
  template_version: string | null;
  design_system: Record<string, unknown> | null;
  // GitHub
  github_repo_id: number | null;
  github_full_name: string | null;
  github_repo_url: string | null;
  github_default_branch: string | null;
  github_status: ProviderStatus;
  draft_branch: string | null;
  production_branch: string | null;
  draft_sha: string | null;
  published_sha: string | null;
  // Sandbox
  sandbox_session_id: string | null;
  sandbox_status: string | null;
  preview_url: string | null;
  // Supabase (mirror of project_backends for cheap reads)
  supabase_project_ref: string | null;
  supabase_url: string | null;
  supabase_status: string | null;
  // Vercel
  vercel_project_id: string | null;
  vercel_status: ProviderStatus;
  vercel_production_deployment_id: string | null;
  vercel_production_url: string | null;
  vercel_previous_deployment_id: string | null;
  vercel_previous_sha: string | null;
  // Domains
  cander_subdomain: string | null;
  custom_domain: string | null;
  custom_domain_status: string | null;
  published_url: string | null;
  // Lifecycle
  infra_status: "pending" | "ready" | "partial" | "error";
  archived_at: string | null;
  teardown_status: Record<string, unknown> | null;
}

export type ProjectBackendStatus = "not_created" | "creating" | "ready" | "paused" | "failed";

export interface ProjectBackendRecord {
  project_id: string;
  workspace_id: string;
  provider: "supabase";
  supabase_project_id: string | null;
  supabase_project_ref: string | null;
  supabase_url: string | null;
  region: string | null;
  organization_id: string | null;
  status: ProjectBackendStatus;
  failure_reason: string | null;
  last_verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export type SecretSource = "provision" | "user" | "integration" | "agent";
export type SecretSensitivity = "public" | "server";

export interface ProjectSecretRecord {
  id: string;
  workspace_id: string;
  project_id: string;
  name: string;
  /** AES-256-GCM, base64(iv || ciphertext || tag). Never sent to clients. */
  ciphertext: string;
  key_version: number;
  source: SecretSource;
  sensitivity: SecretSensitivity;
  description: string | null;
  created_by: string | null;
  last_rotated_at: string;
  created_at: string;
  updated_at: string;
}

export type EnvScope = "all" | "development" | "preview" | "production";

export interface ProjectEnvVarRecord {
  id: string;
  workspace_id: string;
  project_id: string;
  name: string;
  scope: EnvScope;
  plain_value: string | null;
  secret_id: string | null;
  sandbox_synced_hash: string | null;
  sandbox_synced_at: string | null;
  vercel_synced_hash: string | null;
  vercel_synced_at: string | null;
  vercel_env_id: string | null;
  created_at: string;
  updated_at: string;
}

export type BuildRunKind = "create" | "edit" | "repair" | "publish_fix" | "verify";
export type BuildRunStatus =
  | "queued"
  | "planning"
  | "editing"
  | "testing"
  | "fixing"
  | "verifying"
  | "complete"
  | "failed"
  | "canceled";

export interface BuildRunRecord {
  id: string;
  workspace_id: string;
  project_id: string;
  user_id: string | null;
  build_job_id: string | null;
  kind: BuildRunKind;
  status: BuildRunStatus;
  instruction: string | null;
  summary: string | null;
  base_sha: string | null;
  result_sha: string | null;
  failure_kind: "infra" | "app" | "budget" | "agent" | "unknown" | null;
  failure_reason: string | null;
  llm_calls: number;
  input_tokens: number;
  output_tokens: number;
  tool_calls: number;
  files_touched: number;
  estimated_cost_usd: number | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BuildRunToolCallRecord {
  id: number;
  run_id: string;
  workspace_id: string;
  seq: number;
  tool: string;
  summary: string | null;
  paths: string[];
  ok: boolean | null;
  duration_ms: number | null;
  created_at: string;
}

export type DeploymentState =
  | "queued"
  | "building"
  | "ready"
  | "failed"
  | "canceled"
  | "promoted"
  | "rolled_back";

export interface DeploymentEventRecord {
  id: number;
  workspace_id: string;
  project_id: string;
  publish_attempt_id: string | null;
  vercel_deployment_id: string | null;
  commit_sha: string | null;
  state: DeploymentState;
  url: string | null;
  failure_reason: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}

export type ProjectMigrationStatus = "pending" | "applied" | "failed" | "rolled_back";

export interface ProjectMigrationRecord {
  id: string;
  workspace_id: string;
  project_id: string;
  version: string;
  name: string;
  file_path: string;
  checksum: string;
  status: ProjectMigrationStatus;
  applied_to: "development" | "production" | null;
  applied_at: string | null;
  applied_sha: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

/** Map a build job status/phase onto the run lifecycle (build_runs.status). */
export function buildRunStatusFromPhase(phase: string | null | undefined, jobStatus: string): BuildRunStatus {
  if (jobStatus === "queued") return "queued";
  if (jobStatus === "ready_for_review") return "complete";
  if (jobStatus === "failed") return "failed";
  if (jobStatus === "cancelled") return "canceled";
  switch (phase) {
    case "planning":
    case "researching":
      return "planning";
    case "implementing":
      return "editing";
    case "validating":
      return "testing";
    case "booting":
    case "preview_check":
    case "visual_review":
      return "verifying";
    default:
      return jobStatus === "verifying" ? "verifying" : "editing";
  }
}
