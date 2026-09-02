import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { checkConnectorRateLimitAsync } from "@/lib/connectors/rate-limit";
import {
  assertWorkspaceMember,
  resolveConnectorRequest,
} from "@/lib/connectors/server-context";
import {
  patchAccessTier,
  sanitizeToolPermissionsPatch,
  updateConnectionToolPermissions,
  extractConnectorErrorMessage,
} from "@/lib/connectors/tool-permissions";
import type { ConnectorToolAccess } from "@/lib/connectors/tool-catalog";

export const runtime = "nodejs";

function isAccessTier(value: string): value is ConnectorToolAccess {
  return value === "read" || value === "write";
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  }

  const { id } = await context.params;
  let body: {
    workspaceId?: string;
    permissions?: Record<string, unknown>;
    access?: string;
    enabled?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const ctx = await resolveConnectorRequest({
    request,
    workspaceId: body.workspaceId,
  });
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const member = await assertWorkspaceMember(ctx.user.id, ctx.workspaceId);
  if (!member) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const rate = await checkConnectorRateLimitAsync({
    key: `permissions:${ctx.user.id}:${id}`,
    category: "connector_disconnect",
    workspaceId: ctx.workspaceId,
    profileId: ctx.user.id,
  });
  if (!rate.ok) {
    return NextResponse.json({ error: rate.error }, { status: rate.status });
  }

  try {
    const { getUserConnection } = await import("@/lib/connectors/lifecycle");
    const existing = await getUserConnection({
      client: ctx.client,
      connectionId: id,
      ownerId: ctx.user.id,
    });
    if (!existing.ok) {
      return NextResponse.json({ error: existing.error }, { status: existing.status });
    }
    if (existing.connection.workspaceId !== ctx.workspaceId) {
      return NextResponse.json({ error: "Connection not found." }, { status: 404 });
    }
    if (existing.connection.status !== "active") {
      return NextResponse.json(
        { error: "Tool permissions can only be changed on active connections." },
        { status: 409 },
      );
    }

    let permissionsPatch: Record<string, boolean>;
    if (body.access && isAccessTier(body.access) && typeof body.enabled === "boolean") {
      permissionsPatch = patchAccessTier(
        existing.connection.connectorId,
        body.access,
        body.enabled,
        existing.connection.toolPermissions,
      );
    } else if (body.permissions && typeof body.permissions === "object") {
      permissionsPatch = sanitizeToolPermissionsPatch(
        existing.connection.connectorId,
        body.permissions,
      );
      if (!Object.keys(permissionsPatch).length) {
        return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
      }
      permissionsPatch = {
        ...existing.connection.toolPermissions,
        ...permissionsPatch,
      };
    } else {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    const result = await updateConnectionToolPermissions({
      client: ctx.client,
      connectionId: id,
      ownerId: ctx.user.id,
      workspaceId: ctx.workspaceId,
      permissions: permissionsPatch,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ ok: true, connection: result.connection });
  } catch (err) {
    const message = extractConnectorErrorMessage(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
