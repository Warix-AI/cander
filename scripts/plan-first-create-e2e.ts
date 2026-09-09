/**
 * Plan-first create E2E (server): fresh site → TSX scaffold + conflict deletes →
 * plan artifacts → tip via `gh` (avoids tsx/octokit CJS issue) → unique routes.
 *
 * Does not use Worthy. Leaves a uniquely titled smoke project.
 *
 *   npx tsx --env-file=.env.local scripts/plan-first-create-e2e.ts
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { composeSiteFromSpec } from "../lib/ai/build/compose-site.ts";
import {
  projectSpecFromBriefHeuristic,
  buildPlanFromSpecHeuristic,
} from "../lib/ai/build/plan/heuristics.ts";
import { isPlanFirstBuildEnabled } from "../lib/ai/build/plan/flag.ts";
import {
  deletePathsForPreferredWrites,
  duplicateAppRouterValidationIssues,
} from "../lib/ai/build/routes/app-router-conflicts.ts";
import { validatePlanFirstTip } from "../lib/ai/build/validate/plan-first.ts";
import { assessPreviewHealth } from "../lib/build/preview/health.ts";
import type { SiteSpec } from "../lib/ai/build/site-spec.ts";

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

function sh(
  cmd: string,
  args: string[],
  cwd?: string,
): { ok: boolean; out: string; err: string } {
  const res = spawnSync(cmd, args, {
    cwd,
    encoding: "utf8",
    env: process.env,
  });
  return {
    ok: res.status === 0,
    out: (res.stdout || "").trim(),
    err: (res.stderr || "").trim(),
  };
}

async function main() {
  process.env.CANDER_BUILD_PLAN_FIRST ||= "1";
  process.env.NEXT_PUBLIC_CANDER_BUILD_PLAN_FIRST ||= "1";
  if (!isPlanFirstBuildEnabled()) {
    throw new Error("plan-first flag not enabled");
  }
  console.log("[e2e] flags ok", {
    server: process.env.CANDER_BUILD_PLAN_FIRST,
    public: process.env.NEXT_PUBLIC_CANDER_BUILD_PLAN_FIRST,
  });

  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const workspaceId =
    process.env.CANDER_SMOKE_WORKSPACE_ID?.trim() ||
    "ws-05bbe28b5c56491ea496f93c2eeea33e";
  const org = process.env.CANDER_SMOKE_GITHUB_ORG?.trim() || "Warix-AI";
  if (org.includes("SENSITIVE") || org.includes("%5B")) {
    throw new Error("Set CANDER_SMOKE_GITHUB_ORG to a real org (e.g. Warix-AI)");
  }

  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const suffix = Date.now().toString(36);
  const title = `planfirst-e2e-${suffix}`;
  const projectId = crypto.randomUUID();
  const now = new Date().toISOString();
  const subdomain = `pfe2e-${suffix}`.slice(0, 40);

  console.log("[e2e] creating project", { title, projectId });
  const { error: insertErr } = await admin.from("projects").insert({
    id: projectId,
    workspace_id: workspaceId,
    space_id: "build",
    title,
    summary: "Plan-first E2E website",
    kind: "site",
    status: "draft",
    version: 1,
    created_at: now,
    updated_at: now,
    domains: [],
    cander_subdomain: subdomain,
  });
  if (insertErr) throw new Error(insertErr.message);

  const brief = {
    status: "building" as const,
    completedSteps: 8,
    answers: {
      business_name: "Northwind Trail Co",
      industry: "outdoor gear",
      intent: "Sell guided hiking kits",
      audience: "weekend hikers",
      tone: "adventurous",
      primary_goal: "Book trips",
    },
    updatedAt: now,
  };

  const projectSpec = projectSpecFromBriefHeuristic(brief, "Build my site");
  const buildPlan = buildPlanFromSpecHeuristic(projectSpec);

  const siteSpec = {
    businessName: "Northwind Trail Co",
    tagline: "Gear up for the trail",
    industry: "outdoor gear",
    intent: "Sell guided hiking kits",
    ctaPrimary: { label: "Book a trip", href: "#contact" },
    nav: [
      { label: "Home", href: "/" },
      { label: "Contact", href: "#contact" },
    ],
    headerVariant: "sticky-cta",
    footerVariant: "simple-bar",
    theme: {
      layoutStyle: "clean-saas",
      primary: "#0f172a",
      primaryForeground: "#fff",
      accent: "#0ea5e9",
      background: "#ffffff",
      foreground: "#0f172a",
      muted: "#f1f5f9",
      mutedForeground: "#64748b",
      border: "#e2e8f0",
      radius: "10px",
      fontDisplay: "system-ui",
      fontBody: "system-ui",
      spacingScale: "comfortable",
    },
    pages: [
      {
        id: "home",
        path: "/",
        title: "Home",
        sections: [
          {
            id: "hero",
            kind: "features",
            variant: "split",
            title: "Hit the trail ready",
            body: "Guided kits for weekend hikers.",
            ctaLabel: "Book a trip",
            ctaHref: "#contact",
          },
          {
            id: "contact",
            kind: "form",
            variant: "centered",
            title: "Contact",
            body: "Tell us about your next hike.",
            ctaLabel: "Send",
            ctaHref: "mailto:hello@example.com",
          },
        ],
      },
    ],
    customGaps: [],
  } as SiteSpec;

  const files = composeSiteFromSpec(siteSpec);
  const deletePaths = [
    ...new Set([...deletePathsForPreferredWrites(files), "app/page.js"]),
  ];
  const dupBefore = duplicateAppRouterValidationIssues([
    ...files.map((f) => f.path),
    "app/page.js",
  ]);
  if (dupBefore.length === 0) {
    throw new Error("expected duplicate detection for page.js + page.tsx");
  }
  console.log("[e2e] conflict detection ok");

  const validation = validatePlanFirstTip({
    files,
    spec: siteSpec,
    plan: {
      ...buildPlan.json,
      nav: siteSpec.nav,
      sitemap: siteSpec.pages.map((p) => ({
        id: p.id,
        path: p.path,
        title: p.title,
      })),
    },
  });
  console.log("[e2e] tip validation", {
    ok: validation.ok,
    issues: validation.issues.slice(0, 5),
  });
  if (!validation.ok) {
    throw new Error(`validation failed: ${validation.issues.join("; ")}`);
  }

  const researchManifest = {
    version: 1 as const,
    roles: (buildPlan.json.componentNeeds || []).slice(0, 3).map((need) => ({
      role: need.role,
      designIntent: need.designIntent,
      queries: [`${need.role} ${need.designIntent}`],
      candidates: [],
      selected: null,
      rejected: [],
      fallback: "catalog" as const,
      deps: [],
      primitives: [],
      assets: [],
      config: [],
    })),
    packageDependencies: {},
    updatedAt: now,
  };

  const implementationManifest = {
    version: 1 as const,
    files: files.map((f) => ({ path: f.path })),
    routes: siteSpec.pages.map((p) => ({ path: p.path, pageId: p.id })),
    tasks: ["compose", "validate", "e2e"],
    validation: {
      ok: true,
      technical: [] as string[],
      visual: [] as string[],
    },
    updatedAt: now,
  };

  const repoName = `cander-${projectId.replace(/-/g, "").slice(0, 24)}`;
  const fullName = `${org}/${repoName}`;

  console.log("[e2e] creating github repo", fullName);
  const created = sh("gh", [
    "repo",
    "create",
    fullName,
    "--private",
    "--description",
    `Cander plan-first e2e ${title}`,
  ]);
  if (!created.ok) {
    throw new Error(`gh repo create failed: ${created.err || created.out}`);
  }

  const work = mkdtempSync(join(tmpdir(), "cander-pfe2e-"));
  try {
    // Seed conflicting page.js then overwrite with TSX scaffold and remove siblings.
    mkdirSync(join(work, "app"), { recursive: true });
    writeFileSync(
      join(work, "app/page.js"),
      "export default function Bad(){return null}\n",
    );
    sh("git", ["init", "-b", "main"], work);
    sh("git", ["config", "user.email", "cander-e2e@cander.app"], work);
    sh("git", ["config", "user.name", "Cander E2E"], work);
    sh("git", ["add", "."], work);
    sh("git", ["commit", "-m", "seed conflicting page.js"], work);

    for (const f of files) {
      const abs = join(work, f.path);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, f.content);
    }
    for (const p of deletePaths) {
      try {
        rmSync(join(work, p), { force: true });
      } catch {
        /* missing ok */
      }
    }
    sh("git", ["add", "-A"], work);
    const commit = sh(
      "git",
      ["commit", "-m", "Cander e2e: TSX scaffold + remove legacy routes"],
      work,
    );
    if (!commit.ok && !/nothing to commit/i.test(commit.err + commit.out)) {
      throw new Error(`git commit failed: ${commit.err || commit.out}`);
    }
    // Draft branch tip
    sh("git", ["branch", "cander/draft"], work);
    sh("git", ["checkout", "cander/draft"], work);
    const remote = sh(
      "git",
      ["remote", "add", "origin", `https://github.com/${fullName}.git`],
      work,
    );
    if (!remote.ok) throw new Error(remote.err);
    const push = sh(
      "git",
      ["push", "-u", "origin", "main", "cander/draft"],
      work,
    );
    if (!push.ok) throw new Error(`git push failed: ${push.err || push.out}`);
    const sha = sh("git", ["rev-parse", "HEAD"], work);
    if (!sha.ok) throw new Error("rev-parse failed");
    const draftSha = sha.out;

    // List tip files via gh
    const tree = sh("gh", [
      "api",
      `repos/${fullName}/git/trees/${draftSha}?recursive=1`,
      "--jq",
      ".tree[].path",
    ]);
    if (!tree.ok) throw new Error(`tree list failed: ${tree.err}`);
    const paths = tree.out.split("\n").filter(Boolean);
    const dups = duplicateAppRouterValidationIssues(paths);
    if (dups.length) {
      throw new Error(`tip still has duplicates: ${dups.join("; ")}`);
    }
    if (!paths.includes("app/page.tsx")) {
      throw new Error("tip missing app/page.tsx");
    }
    if (paths.includes("app/page.js")) {
      throw new Error("tip still has app/page.js after delete");
    }
    console.log("[e2e] tip routes unique + TSX present");

    const { error: artErr } = await admin
      .from("projects")
      .update({
        project_spec: projectSpec,
        build_plan: buildPlan,
        research_manifest: researchManifest,
        implementation_manifest: implementationManifest,
        website_setup_brief: {
          ...brief,
          status: "ready",
          siteSpec,
          validationIssues: [],
          draftRunnable: true,
        },
        github_full_name: fullName,
        draft_branch: "cander/draft",
        draft_sha: draftSha,
        github_default_branch: "main",
        infra_status: "ready",
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId)
      .eq("workspace_id", workspaceId);
    if (artErr) throw new Error(artErr.message);

    const { data: row, error: readErr } = await admin
      .from("projects")
      .select(
        "id, title, project_spec, build_plan, research_manifest, implementation_manifest, github_full_name, draft_sha",
      )
      .eq("id", projectId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (
      !row?.project_spec ||
      !row?.build_plan ||
      !row?.research_manifest ||
      !row?.implementation_manifest ||
      !row?.github_full_name ||
      !row?.draft_sha
    ) {
      throw new Error("plan-first artifacts / tip not all persisted");
    }
    console.log("[e2e] artifacts non-null + tip bound");

    const bad = assessPreviewHealth({
      status: 500,
      bodyText: "<html>__next_error</html>",
    });
    if (bad.ok) throw new Error("expected 500 health fail");

    console.log("[e2e] PASS", {
      projectId,
      title,
      fullName,
      draftSha: draftSha.slice(0, 12),
      subdomain,
      fileCount: files.length,
      note: "Sandbox/publish require production deploy + UI; tip+artifacts verified here.",
    });
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error("[e2e] FAIL", err);
  process.exit(1);
});
