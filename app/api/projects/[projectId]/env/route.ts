/**
 * Project environment variables & secrets.
 *   GET    /api/projects/:id/env?workspaceId=   → names + scope + whether secret (never values)
 *   PUT    /api/projects/:id/env  { workspaceId, name, value, scope?, secret? }
 *   DELETE /api/projects/:id/env  { workspaceId, name, scope? }
 *
 * Secret values go to the vault; plain values are stored inline. Changes reach
 * the sandbox on the next preview start and Vercel on the next publish.
 */

import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import { assertProjectAccess } from "@/lib/security/project-access";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { setProjectEnvVar, setProjectSecretEnvVar, type EnvScope } from "@/lib/build/env/sync";
import { vaultConfigured } from "@/lib/build/secrets/vault";

export const runtime = "nodejs";
export const maxDuration = 30;

type RouteCtx = { params: Promise<{ projectId: string }> };

const NAME_RE = /^[A-Z][A-Z0-9_]{0,63}$/;
const SCOPES: EnvScope[] = ["all", "development", "preview", "production"];

async function gate(request: Request, ctx: RouteCtx, workspaceId: string | null | undefined) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) return { error: NextResponse.json({ error: auth.error }, { status: auth.status }) };
  const { projectId: rawId } = await ctx.params;
  const projectId = rawId?.trim();
  const ws = workspaceId?.trim();
  if (!projectId || !ws) return { error: NextResponse.json({ error: "projectId and workspaceId are required." }, { status: 400 }) };
  const access = await assertProjectAccess({ projectId, workspaceId: ws, userId: auth.user.id });
  if (!access.ok) return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  return { projectId, workspaceId: ws, userId: auth.user.id };
}

export async function GET(request: Request, ctx: RouteCtx) {
  const url = new URL(request.url);
  const g = await gate(request, ctx, url.searchParams.get("workspaceId"));
  if ("error" in g) return g.error;
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("project_env_vars")
    .select("name, scope, secret_id, vercel_synced_at, sandbox_synced_at, updated_at")
    .eq("project_id", g.projectId)
    .order("name");
  return NextResponse.json({
    ok: true,
    vaultConfigured: vaultConfigured(),
    vars: (data ?? []).map((r) => ({
      name: String(r.name),
      scope: String(r.scope),
      secret: r.secret_id !== null,
      liveSyncedAt: r.vercel_synced_at ?? null,
      updatedAt: r.updated_at,
    })),
  });
}

export async function PUT(request: Request, ctx: RouteCtx) {
  const body = (await request.json().catch(() => ({}))) as {
    workspaceId?: string;
    name?: string;
    value?: string;
    scope?: string;
    secret?: boolean;
  };
  const g = await gate(request, ctx, body.workspaceId);
  if ("error" in g) return g.error;
  const name = String(body.name ?? "").trim();
  const value = String(body.value ?? "");
  const scope = (SCOPES.includes(body.scope as EnvScope) ? body.scope : "all") as EnvScope;
  if (!NAME_RE.test(name)) return NextResponse.json({ error: "Names use capital letters, numbers and underscores (e.g. STRIPE_SECRET_KEY)." }, { status: 400 });
  if (!value) return NextResponse.json({ error: "A value is required." }, { status: 400 });
  if (value.length > 32_000) return NextResponse.json({ error: "Value is too long." }, { status: 400 });
  // Anything that is not clearly public config is stored as a secret.
  const secret = body.secret ?? !name.startsWith("NEXT_PUBLIC_");
  if (secret && name.startsWith("NEXT_PUBLIC_")) {
    return NextResponse.json({ error: "NEXT_PUBLIC_ values are visible in the browser and cannot be secrets." }, { status: 400 });
  }
  if (secret) {
    if (!vaultConfigured()) return NextResponse.json({ error: "Secret storage is not set up on this server yet." }, { status: 503 });
    await setProjectSecretEnvVar({ projectId: g.projectId, workspaceId: g.workspaceId, name, value, scope });
  } else {
    await setProjectEnvVar({ projectId: g.projectId, workspaceId: g.workspaceId, name, value, scope });
  }
  return NextResponse.json({ ok: true, name, scope, secret });
}

export async function DELETE(request: Request, ctx: RouteCtx) {
  const body = (await request.json().catch(() => ({}))) as { workspaceId?: string; name?: string; scope?: string };
  const g = await gate(request, ctx, body.workspaceId);
  if ("error" in g) return g.error;
  const name = String(body.name ?? "").trim();
  if (!NAME_RE.test(name)) return NextResponse.json({ error: "Invalid name." }, { status: 400 });
  const admin = createSupabaseAdminClient();
  let q = admin.from("project_env_vars").delete().eq("project_id", g.projectId).eq("name", name);
  if (body.scope && SCOPES.includes(body.scope as EnvScope)) q = q.eq("scope", body.scope);
  const { error } = await q;
  if (error) return NextResponse.json({ error: "Could not remove the setting." }, { status: 500 });
  // Remove the vault entry when no env row references it any more.
  const { data: remaining } = await admin.from("project_env_vars").select("id").eq("project_id", g.projectId).eq("name", name).limit(1);
  if (!remaining?.length) await admin.from("project_secrets").delete().eq("project_id", g.projectId).eq("name", name);
  return NextResponse.json({ ok: true });
}
