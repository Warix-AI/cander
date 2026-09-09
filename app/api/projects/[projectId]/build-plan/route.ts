/**
 * GET/PATCH /api/projects/:id/build-plan
 * Plan-first artifacts (ProjectSpec, BuildPlan, Research, Implementation).
 */

import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import { assertProjectAccess } from "@/lib/security/project-access";
import {
  normalizeBuildPlanRecord,
  normalizeImplementationManifest,
  normalizeProjectSpec,
  normalizeResearchManifest,
} from "@/lib/ai/build/plan/normalize";
import {
  loadPlanFirstArtifacts,
  savePlanFirstArtifacts,
} from "@/lib/ai/build/plan/store";
import { renderBuildPlanMarkdown } from "@/lib/ai/build/plan/markdown";

export const runtime = "nodejs";

type RouteCtx = { params: Promise<{ projectId: string }> };

export async function GET(request: Request, ctx: RouteCtx) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { projectId: rawId } = await ctx.params;
  const projectId = rawId?.trim();
  const workspaceId = new URL(request.url).searchParams
    .get("workspaceId")
    ?.trim();
  if (!projectId || !workspaceId) {
    return NextResponse.json(
      { error: "projectId and workspaceId are required." },
      { status: 400 },
    );
  }

  const access = await assertProjectAccess({
    projectId,
    workspaceId,
    userId: auth.user.id,
  });
  if (!access.ok) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const artifacts = await loadPlanFirstArtifacts(projectId, workspaceId);
  // Keep heavy manifests server-side for browser GETs — return summaries only.
  const wantFull =
    new URL(request.url).searchParams.get("full") === "1";
  if (!wantFull) {
    return NextResponse.json({
      ok: true,
      projectSpec: artifacts.projectSpec,
      buildPlan: artifacts.buildPlan
        ? {
            version: artifacts.buildPlan.version,
            // markdown stays DB-private; omit from default client payload
            markdown: "",
            json: {
              ...artifacts.buildPlan.json,
              // Drop long checklist noise in list views
              validationChecklist:
                artifacts.buildPlan.json.validationChecklist?.slice(0, 12) ??
                [],
            },
            updatedAt: artifacts.buildPlan.updatedAt,
          }
        : null,
      researchManifest: artifacts.researchManifest
        ? {
            version: artifacts.researchManifest.version,
            roles: artifacts.researchManifest.roles.map((r) => ({
              role: r.role,
              designIntent: r.designIntent,
              selected: r.selected
                ? {
                    id: r.selected.id,
                    name: r.selected.name,
                    score: r.selected.score,
                    reasons: r.selected.reasons.slice(0, 3),
                  }
                : r.selected,
              fallback: r.fallback,
              rejectedCount: r.rejected.length,
              candidateCount: r.candidates.length,
            })),
            packageDependencies: artifacts.researchManifest.packageDependencies,
            updatedAt: artifacts.researchManifest.updatedAt,
          }
        : null,
      implementationManifest: artifacts.implementationManifest
        ? {
            version: artifacts.implementationManifest.version,
            fileCount: artifacts.implementationManifest.files.length,
            routes: artifacts.implementationManifest.routes,
            tasks: artifacts.implementationManifest.tasks.slice(0, 20),
            validation: artifacts.implementationManifest.validation,
            updatedAt: artifacts.implementationManifest.updatedAt,
          }
        : null,
    });
  }
  return NextResponse.json({ ok: true, ...artifacts });
}

export async function PATCH(request: Request, ctx: RouteCtx) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { projectId: rawId } = await ctx.params;
  const projectId = rawId?.trim();

  let body: {
    workspaceId?: string;
    projectSpec?: unknown;
    buildPlan?: unknown;
    researchManifest?: unknown;
    implementationManifest?: unknown;
  } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const workspaceId = body.workspaceId?.trim();
  if (!projectId || !workspaceId) {
    return NextResponse.json(
      { error: "projectId and workspaceId are required." },
      { status: 400 },
    );
  }

  const access = await assertProjectAccess({
    projectId,
    workspaceId,
    userId: auth.user.id,
  });
  if (!access.ok) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const projectSpec =
    body.projectSpec === undefined
      ? undefined
      : body.projectSpec === null
        ? null
        : normalizeProjectSpec(body.projectSpec);
  if (body.projectSpec !== undefined && body.projectSpec !== null && !projectSpec) {
    return NextResponse.json(
      { error: "Invalid projectSpec." },
      { status: 400 },
    );
  }

  let buildPlan =
    body.buildPlan === undefined
      ? undefined
      : body.buildPlan === null
        ? null
        : normalizeBuildPlanRecord(body.buildPlan);
  if (body.buildPlan !== undefined && body.buildPlan !== null && !buildPlan) {
    return NextResponse.json({ error: "Invalid buildPlan." }, { status: 400 });
  }
  if (buildPlan && !buildPlan.markdown.trim()) {
    buildPlan = {
      ...buildPlan,
      markdown: renderBuildPlanMarkdown(buildPlan.json),
    };
  }

  const researchManifest =
    body.researchManifest === undefined
      ? undefined
      : body.researchManifest === null
        ? null
        : normalizeResearchManifest(body.researchManifest);

  const implementationManifest =
    body.implementationManifest === undefined
      ? undefined
      : body.implementationManifest === null
        ? null
        : normalizeImplementationManifest(body.implementationManifest);

  const saved = await savePlanFirstArtifacts({
    projectId,
    workspaceId,
    projectSpec,
    buildPlan,
    researchManifest,
    implementationManifest,
  });
  return NextResponse.json({ ok: true, ...saved });
}
