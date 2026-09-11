import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { V2ProjectConfig } from "./types.ts";
import { STARTER_BLUEPRINTS, STARTER_CATEGORIES } from "./blueprints.ts";
import { THEME_PRESETS, BEHAVIOR_PRESETS } from "./presets.ts";
import { listVariantContracts } from "./registry.ts";

export async function loadV2ProjectConfig(projectId: string): Promise<{
  builderVersion: string;
  config: V2ProjectConfig | null;
  blueprintId: string | null;
  blueprintVersion: number | null;
} | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("projects")
    .select("builder_version, builder_v2_config, builder_v2_blueprint_id, builder_v2_blueprint_version")
    .eq("id", projectId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    builderVersion: String(data.builder_version || "v1"),
    config: (data.builder_v2_config as V2ProjectConfig | null) || null,
    blueprintId: data.builder_v2_blueprint_id ? String(data.builder_v2_blueprint_id) : null,
    blueprintVersion:
      data.builder_v2_blueprint_version != null
        ? Number(data.builder_v2_blueprint_version)
        : null,
  };
}

export async function saveV2ProjectConfig(opts: {
  projectId: string;
  workspaceId: string;
  config: V2ProjectConfig;
  userId?: string | null;
  summary?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("projects")
    .update({
      builder_version: "v2_config",
      builder_v2_config: opts.config,
      builder_v2_blueprint_id: opts.config.blueprintId,
      builder_v2_blueprint_version: opts.config.blueprintVersion,
      updated_at: new Date().toISOString(),
    })
    .eq("id", opts.projectId)
    .eq("workspace_id", opts.workspaceId);
  if (error) return { ok: false, error: error.message };

  // Best-effort revision history
  await admin.from("builder_v2_config_revisions").insert({
    project_id: opts.projectId,
    workspace_id: opts.workspaceId,
    revision: opts.config.revision,
    config: opts.config,
    summary: opts.summary || "Config update",
    created_by: opts.userId || null,
  });

  return { ok: true };
}

/** Upsert catalog seed (idempotent). Safe for service_role. */
export async function seedBuilderV2Catalog(): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createSupabaseAdminClient();

  const { error: catErr } = await admin.from("builder_v2_categories").upsert(
    STARTER_CATEGORIES.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      sort_order: c.sort_order,
      active: true,
      updated_at: new Date().toISOString(),
    })),
  );
  if (catErr) return { ok: false, error: catErr.message };

  const { error: themeErr } = await admin.from("builder_v2_theme_presets").upsert(
    Object.entries(THEME_PRESETS).map(([id, t]) => ({
      id,
      name: t.name,
      description: t.description,
      tokens: t.tokens,
      active: true,
      updated_at: new Date().toISOString(),
    })),
  );
  if (themeErr) return { ok: false, error: themeErr.message };

  const { error: behErr } = await admin.from("builder_v2_behavior_presets").upsert(
    Object.entries(BEHAVIOR_PRESETS).map(([id, t]) => ({
      id,
      name: t.name,
      description: t.description,
      tokens: t.tokens,
      active: true,
      updated_at: new Date().toISOString(),
    })),
  );
  if (behErr) return { ok: false, error: behErr.message };

  const variants = listVariantContracts();
  const types = [...new Set(variants.map((v) => v.typeId))];
  const { error: typeErr } = await admin.from("builder_v2_component_types").upsert(
    types.map((id, i) => ({
      id,
      name: id.replace(/_/g, " "),
      description: `V2 component type: ${id}`,
      sort_order: i,
      active: true,
      updated_at: new Date().toISOString(),
    })),
  );
  if (typeErr) return { ok: false, error: typeErr.message };

  const headers = variants.filter((v) => v.typeId === "header");
  const footers = variants.filter((v) => v.typeId === "footer");
  await admin.from("builder_v2_header_variants").upsert(
    headers.map((v) => ({
      id: v.id,
      name: v.name,
      description: v.description,
      renderer_id: v.rendererId,
      content_schema: v.contentSchema,
      config_schema: v.configSchema,
      active: true,
      updated_at: new Date().toISOString(),
    })),
  );
  await admin.from("builder_v2_footer_variants").upsert(
    footers.map((v) => ({
      id: v.id,
      name: v.name,
      description: v.description,
      renderer_id: v.rendererId,
      content_schema: v.contentSchema,
      config_schema: v.configSchema,
      active: true,
      updated_at: new Date().toISOString(),
    })),
  );

  const { error: varErr } = await admin.from("builder_v2_component_variants").upsert(
    variants
      .filter((v) => v.typeId !== "header" && v.typeId !== "footer")
      .map((v, i) => ({
        id: v.id,
        component_type_id: v.typeId,
        name: v.name,
        description: v.description,
        renderer_id: v.rendererId,
        content_schema: v.contentSchema,
        config_schema: v.configSchema,
        capabilities: v.capabilities,
        responsive_rules: { notes: v.responsive },
        sort_order: i,
        active: true,
        updated_at: new Date().toISOString(),
      })),
  );
  if (varErr) return { ok: false, error: varErr.message };

  const { error: bpErr } = await admin.from("builder_v2_blueprints").upsert(
    STARTER_BLUEPRINTS.map((b) => ({
      id: b.id,
      name: b.name,
      category_id: b.categoryId,
      description: b.description,
      status: b.status,
      version: b.version,
      theme_preset_id: b.themePresetId,
      behavior_preset_id: b.behaviorPresetId,
      header_variant_id: b.headerVariantId,
      footer_variant_id: b.footerVariantId,
      definition: b.definition,
      sort_order: b.sortOrder,
      updated_at: new Date().toISOString(),
    })),
  );
  if (bpErr) return { ok: false, error: bpErr.message };

  return { ok: true };
}
