/**
 * Server API for 21st.dev MCP — keeps API_KEY_21ST off the client.
 * POST /api/ai/twenty-first
 *
 * actions: status | search | get | retrieve_for_spec
 */

import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import { assertProjectAccess } from "@/lib/security/project-access";
import type { SiteSpec } from "@/lib/ai/build/site-spec";
import type { BuildPlanJson } from "@/lib/ai/build/plan/types";
import {
  createTwentyFirstMcpClient,
  getTwentyFirstApiKey,
  retrieveComponentsForSiteSpec,
  setActiveTwentyFirstClient,
  type TwentyFirstMcpClient,
} from "@/lib/ai/build/twenty-first-mcp";
import { retrieveComponentsForBuildPlan } from "@/lib/ai/build/research/from-build-plan";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Per-project MCP client cache for one build (bounded TTL). */
const clients = new Map<
  string,
  { client: TwentyFirstMcpClient; expiresAt: number }
>();
const CLIENT_TTL_MS = 10 * 60 * 1000;

function clientKey(projectId: string | null, workspaceId: string) {
  return `${workspaceId}:${projectId || "global"}`;
}

async function getOrCreateClient(
  projectId: string | null,
  workspaceId: string,
): Promise<TwentyFirstMcpClient | null> {
  const key = clientKey(projectId, workspaceId);
  const hit = clients.get(key);
  if (hit && hit.expiresAt > Date.now() && hit.client.isConnected) {
    setActiveTwentyFirstClient(hit.client);
    return hit.client;
  }
  const client = await createTwentyFirstMcpClient();
  if (!client) return null;
  clients.set(key, { client, expiresAt: Date.now() + CLIENT_TTL_MS });
  setActiveTwentyFirstClient(client);
  return client;
}

export async function GET() {
  const key = getTwentyFirstApiKey();
  return NextResponse.json({
    ok: true,
    configured: Boolean(key),
    keyMeta: key
      ? { length: key.length, prefix: key.slice(0, 3) }
      : null,
  });
}

export async function POST(request: Request) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: {
    action?: string;
    workspaceId?: string;
    projectId?: string;
    query?: string;
    role?: string;
    limit?: number;
    id?: string;
    componentId?: string;
    spec?: SiteSpec;
    buildPlan?: BuildPlanJson;
  } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const action = (body.action || "").trim();
  const workspaceId = body.workspaceId?.trim() || "";
  const projectId = body.projectId?.trim() || null;

  if (!workspaceId) {
    return NextResponse.json(
      { error: "workspaceId is required." },
      { status: 400 },
    );
  }

  if (projectId) {
    const access = await assertProjectAccess({
      projectId,
      workspaceId,
      userId: auth.user.id,
    });
    if (!access.ok) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
  }

  if (!getTwentyFirstApiKey()) {
    console.warn("[cander:21st-mcp] API route: API_KEY_21ST missing on server");
    return NextResponse.json({
      ok: false,
      configured: false,
      usedFallback: true,
      error: "API_KEY_21ST not configured on server",
      components: [],
      toolsDiscovered: [],
      connected: false,
    });
  }

  try {
    if (action === "status") {
      const client = await getOrCreateClient(projectId, workspaceId);
      return NextResponse.json({
        ok: Boolean(client),
        configured: true,
        connected: Boolean(client?.isConnected),
        toolsDiscovered: client?.discoveredTools ?? [],
      });
    }

    if (action === "search") {
      const query = (body.query || "").trim();
      if (!query) {
        return NextResponse.json({ error: "query required" }, { status: 400 });
      }
      const client = await getOrCreateClient(projectId, workspaceId);
      if (!client) {
        return NextResponse.json({
          ok: false,
          usedFallback: true,
          candidates: [],
          error: "MCP connect failed",
        });
      }
      const hits = await client.search({
        query,
        role: body.role,
        limit: body.limit ?? 5,
      });
      return NextResponse.json({
        ok: true,
        provider: "21st-mcp",
        candidates: hits.map((h) => ({
          id: h.id,
          name: h.name,
          category: body.role || h.category,
          source: "twenty_first",
          hasCode: Boolean(h.codeSnippet?.trim()),
        })),
      });
    }

    if (action === "get") {
      const id = (body.componentId || body.id || "").trim();
      if (!id) {
        return NextResponse.json(
          { error: "componentId required" },
          { status: 400 },
        );
      }
      const client = await getOrCreateClient(projectId, workspaceId);
      if (!client) {
        return NextResponse.json({
          ok: false,
          error: "MCP connect failed",
        });
      }
      const component = await client.getComponent(id);
      return NextResponse.json({
        ok: Boolean(component),
        provider: "21st-mcp",
        component,
      });
    }

    if (action === "retrieve_for_spec") {
      if (!body.spec || typeof body.spec !== "object") {
        return NextResponse.json({ error: "spec required" }, { status: 400 });
      }
      const client = await getOrCreateClient(projectId, workspaceId);
      const retrieval = await retrieveComponentsForSiteSpec(
        body.spec as SiteSpec,
        client,
      );
      console.info("[cander:21st-mcp] api retrieve_for_spec", {
        projectId,
        connected: retrieval.connected,
        tools: retrieval.toolsDiscovered,
        selected: retrieval.components.map((c) => `${c.category}:${c.id}`),
        withCode: retrieval.components.filter((c) => c.codeSnippet?.trim())
          .length,
        usedFallback: retrieval.usedFallback,
      });
      return NextResponse.json({
        ok: !retrieval.usedFallback || retrieval.components.length > 0,
        ...retrieval,
      });
    }

    if (action === "retrieve_for_build_plan") {
      if (!body.buildPlan || typeof body.buildPlan !== "object") {
        return NextResponse.json(
          { error: "buildPlan required" },
          { status: 400 },
        );
      }
      const client = await getOrCreateClient(projectId, workspaceId);
      const retrieval = await retrieveComponentsForBuildPlan(
        body.buildPlan as BuildPlanJson,
        client,
      );
      console.info("[cander:21st-mcp] api retrieve_for_build_plan", {
        projectId,
        roles: retrieval.researchManifest.roles.map((r) => r.role),
        selected: retrieval.components.map((c) => `${c.category}:${c.id}`),
        usedFallback: retrieval.usedFallback,
      });
      return NextResponse.json({
        ok: !retrieval.usedFallback || retrieval.components.length > 0,
        ...retrieval,
      });
    }

    return NextResponse.json(
      { error: `Unknown action: ${action}` },
      { status: 400 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[cander:21st-mcp] api error", message);
    return NextResponse.json(
      {
        ok: false,
        usedFallback: true,
        error: message,
        components: [],
        connected: false,
        toolsDiscovered: [],
      },
      { status: 500 },
    );
  }
}
