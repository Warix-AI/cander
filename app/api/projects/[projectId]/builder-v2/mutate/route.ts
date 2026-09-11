import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { applyV2Mutations } from "@/lib/build/v2/mutations";
import { loadV2ProjectConfig, saveV2ProjectConfig } from "@/lib/build/v2/store";
import type { V2Mutation } from "@/lib/build/v2/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ projectId: string }> };

/**
 * POST /api/projects/:projectId/builder-v2/mutate
 * Body: { workspaceId, mutations: V2Mutation[] }
 */
export async function POST(request: Request, ctx: Ctx) {
  const { projectId } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { workspaceId?: string; mutations?: V2Mutation[] } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const workspaceId = String(body.workspaceId || "").trim();
  const mutations = Array.isArray(body.mutations) ? body.mutations : [];
  if (!workspaceId || !mutations.length) {
    return NextResponse.json({ error: "workspaceId and mutations required" }, { status: 400 });
  }

  const loaded = await loadV2ProjectConfig(projectId);
  if (!loaded || loaded.builderVersion !== "v2_config" || !loaded.config) {
    return NextResponse.json(
      { error: "Project is not a V2 config site" },
      { status: 400 },
    );
  }

  const result = applyV2Mutations(loaded.config, mutations);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 422 });
  }

  const saved = await saveV2ProjectConfig({
    projectId,
    workspaceId,
    config: result.config,
    userId: user.id,
    summary: result.summary,
  });
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 500 });

  return NextResponse.json({ ok: true, summary: result.summary, config: result.config });
}

/** GET config for preview */
export async function GET(_request: Request, ctx: Ctx) {
  const { projectId } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const loaded = await loadV2ProjectConfig(projectId);
  if (!loaded) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    builderVersion: loaded.builderVersion,
    blueprintId: loaded.blueprintId,
    blueprintVersion: loaded.blueprintVersion,
    config: loaded.config,
  });
}
