import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isWebsiteBuilderV2Enabled } from "@/lib/build/v2/flag";
import { extractBrandAndClassify } from "@/lib/build/v2/classify";
import { getStarterBlueprint, hydrateConfigWithBrand, initializeProjectConfigFromBlueprint } from "@/lib/build/v2/init";
import { saveV2ProjectConfig, seedBuilderV2Catalog } from "@/lib/build/v2/store";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ projectId: string }> };

/**
 * POST /api/projects/:projectId/builder-v2/init
 * Body: { workspaceId, description: string, brand?: object, blueprintId?: string }
 *
 * Initializes a V2 config-driven site from a blueprint. Does not start V1 sandbox jobs.
 */
export async function POST(request: Request, ctx: Ctx) {
  if (!isWebsiteBuilderV2Enabled()) {
    return NextResponse.json(
      { error: "Website Builder V2 is disabled. Set CANDER_WEBSITE_BUILDER_V2=1." },
      { status: 403 },
    );
  }

  const { projectId } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    workspaceId?: string;
    description?: string;
    blueprintId?: string;
    seedCatalog?: boolean;
  } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const workspaceId = String(body.workspaceId || "").trim();
  const description = String(body.description || "").trim();
  if (!workspaceId || !description) {
    return NextResponse.json({ error: "workspaceId and description required" }, { status: 400 });
  }

  const { data: project } = await supabase
    .from("projects")
    .select("id, workspace_id, kind, builder_version, builder_v2_config")
    .eq("id", projectId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (String(project.kind) !== "site") {
    return NextResponse.json({ error: "V2 config builder is website-only (kind=site)" }, { status: 400 });
  }
  if (project.builder_v2_config) {
    return NextResponse.json({ error: "Project already has a V2 configuration" }, { status: 409 });
  }
  // Never convert existing V1 sites. V2 projects are created with builder_version=v2_config.
  if (String(project.builder_version || "v1") === "v1") {
    return NextResponse.json(
      {
        error:
          "Cannot convert a V1 project to V2. Create a new site with CANDER_WEBSITE_BUILDER_V2 enabled.",
      },
      { status: 409 },
    );
  }
  if (project.builder_version && project.builder_version !== "v2_config") {
    return NextResponse.json({ error: "Unknown builder_version" }, { status: 400 });
  }

  if (body.seedCatalog !== false) {
    const seeded = await seedBuilderV2Catalog();
    if (!seeded.ok) {
      // Catalog seed may fail if migration not applied; continue with in-code blueprints.
      console.warn("[builder-v2] catalog seed:", seeded.error);
    }
  }

  const extracted = extractBrandAndClassify(description);
  const blueprintId = body.blueprintId || extracted.blueprintId;
  const blueprint = getStarterBlueprint(blueprintId);
  if (!blueprint) {
    return NextResponse.json({ error: `Unknown blueprint ${blueprintId}` }, { status: 400 });
  }

  let config = initializeProjectConfigFromBlueprint({
    blueprint,
    brand: extracted.brand,
    businessDescription: description,
  });
  config = hydrateConfigWithBrand(config);

  const saved = await saveV2ProjectConfig({
    projectId,
    workspaceId,
    config,
    userId: user.id,
    summary: `Initialized from blueprint ${blueprint.id}`,
  });
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 500 });

  // Mark phase ready for V2 — no sandbox coding loop.
  await supabase
    .from("projects")
    .update({
      builder_version: "v2_config",
      build_phase: "ready",
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId);

  return NextResponse.json({
    ok: true,
    builderVersion: "v2_config",
    blueprintId: blueprint.id,
    blueprintName: blueprint.name,
    categoryId: extracted.categoryId,
    missingFields: extracted.missingFields,
    followUpQuestions: extracted.followUpQuestions,
    rationale: extracted.rationale,
    config,
  });
}
