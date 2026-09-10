/**
 * ProjectRuntime — the one context object every agent turn receives.
 *
 * Resolves the current project + its infrastructure from trusted Cander state
 * (never from model- or client-supplied ids): workspace, framework, sandbox,
 * GitHub repo/branches/SHAs, Supabase backend, Vercel project, preview and
 * production URLs, instructions, design system / spec, recent runs and the
 * names (never values) of configured environment variables.
 *
 * Code is the source of truth for code, Supabase for the app's runtime data,
 * migrations for schema history, and this record for provider mappings.
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { BUILD_APP_PORT } from "@/lib/build/sandbox/constants";
import { BUILD_JOB_TASK_TYPE } from "@/lib/build/jobs/store";
import type { ProviderStatus, ProjectFramework } from "@/lib/build/records";

export type ProjectRuntimeKind = "site" | "app";

export interface ProjectRuntimeRun {
  jobId: string;
  mode: "create" | "edit";
  status: string;
  summary: string | null;
  instruction: string | null;
  draftSha: string | null;
  finishedAt: string | null;
}

export interface ProjectRuntime {
  projectId: string;
  workspaceId: string;
  name: string;
  kind: ProjectRuntimeKind;
  framework: ProjectFramework;
  templateVersion: string | null;
  packageManager: "npm" | "pnpm" | "yarn" | "bun";
  /** Free-text rules the user attached to the project (PROJECT.md-style). */
  instructions: string | null;
  /** Persisted spec (purpose, terminology, features, visual system…). */
  spec: Record<string, unknown> | null;
  /** Design tokens; falls back to spec.visual when the column is unset. */
  designSystem: Record<string, unknown> | null;
  sandbox: {
    sessionId: string | null;
    status: string | null;
    devServerUrl: string;
    previewUrl: string | null;
  };
  repo: {
    status: ProviderStatus;
    repoId: number | null;
    fullName: string | null;
    url: string | null;
    draftBranch: string;
    productionBranch: string;
    draftSha: string | null;
    publishedSha: string | null;
  };
  backend: {
    status: string; // not_created | creating | ready | paused | failed | skipped
    ref: string | null;
    url: string | null;
    region: string | null;
  };
  deploy: {
    status: ProviderStatus;
    vercelProjectId: string | null;
    productionDeploymentId: string | null;
    productionUrl: string | null;
    previousDeploymentId: string | null;
  };
  domains: {
    canderSubdomain: string | null;
    customDomain: string | null;
    customDomainStatus: string | null;
    /** The URL the site lives (or will live) at; use for metadataBase etc. */
    siteUrl: string;
  };
  /** Names only. Values are injected by syncProjectEnvironment, never shown to the model. */
  envVarNames: string[];
  recentRuns: ProjectRuntimeRun[];
  infraStatus: string;
  buildPhase: string | null;
  archivedAt: string | null;
}

const PROJECT_SELECT = [
  "id",
  "workspace_id",
  "title",
  "kind",
  "instructions",
  "project_spec",
  "design_system",
  "framework",
  "template_version",
  "sandbox_session_id",
  "sandbox_status",
  "preview_url",
  "github_repo_id",
  "github_full_name",
  "github_repo_url",
  "github_default_branch",
  "github_status",
  "draft_branch",
  "production_branch",
  "draft_sha",
  "published_sha",
  "supabase_project_ref",
  "supabase_url",
  "supabase_status",
  "vercel_project_id",
  "vercel_status",
  "vercel_production_deployment_id",
  "vercel_production_url",
  "vercel_previous_deployment_id",
  "cander_subdomain",
  "custom_domain",
  "custom_domain_status",
  "published_url",
  "infra_status",
  "build_phase",
  "archived_at",
].join(", ");

type ProjectRow = Record<string, unknown>;

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function providerStatus(v: unknown, fallbackReadyWhen: unknown): ProviderStatus {
  const s = str(v);
  if (s === "creating" || s === "ready" || s === "failed" || s === "not_created") return s;
  return fallbackReadyWhen ? "ready" : "not_created";
}

export function resolveSiteUrl(opts: {
  publishedUrl: string | null;
  customDomain: string | null;
  customDomainStatus: string | null;
  subdomain: string | null;
  title: string;
}): string {
  if (opts.publishedUrl?.startsWith("http")) return opts.publishedUrl.replace(/\/+$/, "");
  if (opts.customDomain && opts.customDomainStatus === "verified") {
    return `https://${opts.customDomain.replace(/^https?:\/\//, "").replace(/\/.*$/, "")}`;
  }
  const slug =
    (opts.subdomain || opts.title || "site")
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "site";
  return `https://${slug}.cander.app`;
}

/**
 * Load the runtime for a project. Throws when the project does not belong to
 * the workspace — callers must already have authorized the user for it.
 */
export async function resolveProjectRuntime(opts: {
  projectId: string;
  workspaceId: string;
  /** Skip the recent-runs / env-name queries for hot paths. */
  light?: boolean;
}): Promise<ProjectRuntime> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("projects")
    .select(PROJECT_SELECT)
    .eq("id", opts.projectId)
    .eq("workspace_id", opts.workspaceId)
    .maybeSingle();
  if (error) throw new Error(`project lookup failed: ${error.message}`);
  if (!data) throw new Error("Project not found in this workspace.");
  const p = data as unknown as ProjectRow;

  const [backendRow, envRows, runRows] = await Promise.all([
    admin
      .from("project_backends")
      .select("status, supabase_project_ref, supabase_url, region")
      .eq("project_id", opts.projectId)
      .maybeSingle()
      .then((r) => (r.data as ProjectRow | null) ?? null),
    opts.light
      ? Promise.resolve([] as ProjectRow[])
      : admin
          .from("project_env_vars")
          .select("name")
          .eq("project_id", opts.projectId)
          .then((r) => (r.data as ProjectRow[] | null) ?? []),
    opts.light
      ? Promise.resolve([] as ProjectRow[])
      : admin
          .from("ai_tasks")
          .select("id, status, result_summary, facts, created_at")
          .eq("project_id", opts.projectId)
          .eq("workspace_id", opts.workspaceId)
          .eq("task_type", BUILD_JOB_TASK_TYPE)
          .order("created_at", { ascending: false })
          .limit(5)
          .then((r) => (r.data as ProjectRow[] | null) ?? []),
  ]);

  const title = String(p.title ?? "New site");
  const kind: ProjectRuntimeKind = String(p.kind ?? "").toLowerCase() === "app" ? "app" : "site";
  const spec = (p.project_spec as Record<string, unknown> | null) ?? null;
  const designSystem =
    (p.design_system as Record<string, unknown> | null) ??
    ((spec?.visual as Record<string, unknown> | undefined) ?? null);
  const customDomain = str(p.custom_domain);
  const customDomainStatus = str(p.custom_domain_status);
  const subdomain = str(p.cander_subdomain);
  const publishedUrl = str(p.published_url);
  const productionBranch = str(p.production_branch) ?? str(p.github_default_branch) ?? "main";

  const backendStatus =
    str(backendRow?.status) ??
    (kind === "site" && !str(p.supabase_project_ref)
      ? "skipped"
      : ({ idle: "not_created", pending: "creating", ready: "ready", error: "failed", skipped: "skipped" } as Record<string, string>)[
          str(p.supabase_status) ?? ""
        ] ?? "not_created");

  const recentRuns: ProjectRuntimeRun[] = runRows.map((r) => {
    const facts = (r.facts as Record<string, unknown> | null) ?? {};
    return {
      jobId: String(r.id),
      mode: facts.mode === "edit" ? "edit" : "create",
      status: String(r.status ?? ""),
      summary: str(r.result_summary) ?? str(facts.summary),
      instruction: str(facts.instruction),
      draftSha: str(facts.draftSha),
      finishedAt: str(facts.finishedAt),
    };
  });

  return {
    projectId: String(p.id),
    workspaceId: String(p.workspace_id),
    name: title,
    kind,
    framework: (str(p.framework) as ProjectFramework | null) ?? "nextjs",
    templateVersion: str(p.template_version),
    packageManager: "npm",
    instructions: str(p.instructions),
    spec,
    designSystem,
    sandbox: {
      sessionId: str(p.sandbox_session_id),
      status: str(p.sandbox_status),
      devServerUrl: `http://localhost:${BUILD_APP_PORT}`,
      previewUrl: str(p.preview_url),
    },
    repo: {
      status: providerStatus(p.github_status, p.github_repo_id),
      repoId: p.github_repo_id ? Number(p.github_repo_id) : null,
      fullName: str(p.github_full_name),
      url: str(p.github_repo_url) ?? (str(p.github_full_name) ? `https://github.com/${str(p.github_full_name)}` : null),
      draftBranch: str(p.draft_branch) ?? "cander/draft",
      productionBranch,
      draftSha: str(p.draft_sha),
      publishedSha: str(p.published_sha),
    },
    backend: {
      status: backendStatus,
      ref: str(backendRow?.supabase_project_ref) ?? str(p.supabase_project_ref),
      url:
        str(backendRow?.supabase_url) ??
        str(p.supabase_url) ??
        (str(p.supabase_project_ref) ? `https://${str(p.supabase_project_ref)}.supabase.co` : null),
      region: str(backendRow?.region),
    },
    deploy: {
      status: providerStatus(p.vercel_status, p.vercel_project_id),
      vercelProjectId: str(p.vercel_project_id),
      productionDeploymentId: str(p.vercel_production_deployment_id),
      productionUrl: publishedUrl ?? str(p.vercel_production_url),
      previousDeploymentId: str(p.vercel_previous_deployment_id),
    },
    domains: {
      canderSubdomain: subdomain,
      customDomain,
      customDomainStatus,
      siteUrl: resolveSiteUrl({ publishedUrl, customDomain, customDomainStatus, subdomain, title }),
    },
    envVarNames: [...new Set(envRows.map((r) => String(r.name)))].sort(),
    recentRuns,
    infraStatus: String(p.infra_status ?? "pending"),
    buildPhase: str(p.build_phase),
    archivedAt: str(p.archived_at),
  };
}

/**
 * Compact, model-facing rendering. Plain facts, no secrets, no provider ids
 * the model could misuse — tools resolve ids server-side from the job.
 */
export function renderProjectRuntimeForAgent(rt: ProjectRuntime): string {
  const lines: string[] = [];
  lines.push(`Project: ${rt.name} (${rt.kind === "app" ? "web app" : "website"}, ${rt.framework}, ${rt.packageManager})`);
  lines.push(`Site URL (metadataBase / canonical / sitemap): ${rt.domains.siteUrl}`);
  if (rt.deploy.productionUrl) lines.push(`Live production URL: ${rt.deploy.productionUrl}`);
  lines.push(
    `Source: draft branch "${rt.repo.draftBranch}"${rt.repo.draftSha ? ` @ ${rt.repo.draftSha.slice(0, 7)}` : " (no commits yet)"}; production branch "${rt.repo.productionBranch}"${
      rt.repo.publishedSha ? ` @ ${rt.repo.publishedSha.slice(0, 7)}` : " (never published)"
    }`,
  );
  lines.push(
    `Database: ${
      rt.backend.status === "ready"
        ? `connected (Supabase${rt.backend.region ? `, ${rt.backend.region}` : ""}); env NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are provided`
        : rt.backend.status === "skipped"
          ? "none (static website)"
          : rt.backend.status === "creating"
            ? "being provisioned"
            : "not connected yet — use the database tools when the app needs one"
    }`,
  );
  lines.push(`Preview: dev server at ${rt.sandbox.devServerUrl}${rt.sandbox.status ? ` (${rt.sandbox.status})` : ""}`);
  if (rt.envVarNames.length) lines.push(`Environment variables available (names only): ${rt.envVarNames.join(", ")}`);
  if (rt.instructions) lines.push(`Project instructions from the owner:\n${rt.instructions.trim().slice(0, 2000)}`);
  if (rt.designSystem) {
    lines.push(`Design system (persisted — reuse, do not reinvent): ${JSON.stringify(rt.designSystem).slice(0, 1500)}`);
  }
  const done = rt.recentRuns.filter((r) => r.status === "ready_for_review" && (r.summary || r.instruction));
  if (done.length) {
    lines.push("Recent changes:");
    for (const r of done.slice(0, 4)) {
      lines.push(`- ${r.mode === "create" ? "Initial build" : r.instruction?.slice(0, 120) || "Edit"}${r.summary ? ` → ${r.summary.slice(0, 160)}` : ""}`);
    }
  }
  return lines.join("\n");
}
