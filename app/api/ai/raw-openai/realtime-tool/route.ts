/**
 * Execute a Realtime function call via Cander connector/MCP tools (server-side).
 * POST /api/ai/raw-openai/realtime-tool
 *
 * Mirrors chat agent-loop connection resolution: never trust client connection
 * IDs when ambiguous; ask which account when multiple are connected.
 */

import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import { getCanderTool } from "@/lib/ai/tools/cander-registry";
import { fromOpenAIToolName } from "@/lib/ai/tools/schemas";
import { formatAccountAmbiguousQuestion } from "@/lib/ai/tools/connector-scope";
import { resolveConnectorRequest } from "@/lib/connectors/server-context";
import { checkConnectorRateLimitAsync } from "@/lib/connectors/rate-limit";
import { listActiveConnections } from "@/lib/connectors/connections";
import { executeConnectorToolDetailed } from "@/lib/connectors/tool-execute";
import { appConnectorById } from "@/lib/connectors/apps/definitions";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const started = Date.now();

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase not configured." },
      { status: 503 },
    );
  }

  const auth = await requireBearerUser(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error, latencyMs: Date.now() - started },
      { status: auth.status },
    );
  }

  let body: {
    workspaceId?: string;
    name?: string;
    arguments?: string | Record<string, unknown>;
    callId?: string;
    /** Hint only — ignored when multiple accounts unless it matches one. */
    connectionId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const openaiName = body.name?.trim();
  if (!openaiName) {
    return NextResponse.json({ error: "Tool name required." }, { status: 400 });
  }

  const toolId = fromOpenAIToolName(openaiName);
  const tool = getCanderTool(toolId);
  if (!tool?.connectorId) {
    return NextResponse.json(
      {
        ok: false,
        error: `Unknown tool: ${openaiName}`,
        output: JSON.stringify({
          status: "error",
          error: { code: "unknown_tool", message: `Unknown tool ${toolId}` },
        }),
      },
      { status: 400 },
    );
  }

  const ctx = await resolveConnectorRequest({
    request,
    workspaceId: body.workspaceId,
  });
  if (!ctx.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: ctx.error,
        output: JSON.stringify({ error: ctx.error }),
      },
      { status: ctx.status },
    );
  }

  let args: Record<string, unknown> = {};
  if (typeof body.arguments === "string") {
    try {
      const parsed = JSON.parse(body.arguments) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        args = parsed as Record<string, unknown>;
      }
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid tool arguments JSON.",
          output: JSON.stringify({ error: "Invalid tool arguments JSON." }),
        },
        { status: 400 },
      );
    }
  } else if (body.arguments && typeof body.arguments === "object") {
    args = body.arguments;
  }

  const rate = await checkConnectorRateLimitAsync({
    key: `realtime-tool:${ctx.user.id}:${toolId}`,
    category: "connector_tool_execute",
    workspaceId: ctx.workspaceId,
    profileId: ctx.user.id,
  });
  if (!rate.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: rate.error,
        output: JSON.stringify({ error: rate.error }),
      },
      { status: rate.status },
    );
  }

  try {
    const listed = await listActiveConnections({
      client: ctx.client,
      workspaceId: ctx.workspaceId,
      profileId: ctx.user.id,
      connectorId: tool.connectorId,
    });
    const matches = listed.ok ? listed.connections : [];

    let connectionId: string | null = null;
    const hinted =
      typeof body.connectionId === "string" ? body.connectionId.trim() : "";
    if (hinted && matches.some((m) => m.connectionId === hinted)) {
      connectionId = hinted;
    } else if (matches.length === 1) {
      connectionId = matches[0]!.connectionId;
    } else if (matches.length > 1) {
      const candidates = matches.map((row) => ({
        connectionId: row.connectionId,
        label: row.label,
      }));
      const catalog = appConnectorById(tool.connectorId);
      const message = formatAccountAmbiguousQuestion({
        connectorLabel: catalog?.name ?? tool.connectorId,
        candidates,
      });
      return NextResponse.json({
        ok: false,
        error: message,
        output: JSON.stringify({
          status: "denied",
          error: {
            code: "account_ambiguous",
            message,
            candidates,
          },
        }),
        latencyMs: Date.now() - started,
      });
    } else {
      const catalog = appConnectorById(tool.connectorId);
      const message = `Connect ${catalog?.name ?? tool.connectorId} in Apps first.`;
      return NextResponse.json({
        ok: false,
        error: message,
        output: JSON.stringify({
          status: "denied",
          error: { code: "not_connected", message },
        }),
        latencyMs: Date.now() - started,
      });
    }

    const result = await executeConnectorToolDetailed({
      client: ctx.client,
      workspaceId: ctx.workspaceId,
      profileId: ctx.user.id,
      tool: toolId,
      arguments: args,
      connectionId,
      toolCallId: body.callId,
      confirmed: false,
    });

    if (!result.ok) {
      const denialMessage =
        result.denial && "message" in result.denial
          ? String(result.denial.message ?? "")
          : "";
      const message =
        result.error ||
        denialMessage ||
        (result.denial?.reason
          ? String(result.denial.reason)
          : "Tool execution failed.");
      return NextResponse.json({
        ok: false,
        error: message,
        output: JSON.stringify({
          status: result.denial ? "denied" : "error",
          error: {
            code: result.denial?.reason ?? "tool_error",
            message,
            ...(result.denial &&
            "preview" in result.denial &&
            result.denial.preview
              ? { preview: result.denial.preview }
              : {}),
          },
        }),
        latencyMs: Date.now() - started,
      });
    }

    return NextResponse.json({
      ok: true,
      output:
        typeof result.output === "string"
          ? result.output
          : JSON.stringify(result.output ?? { ok: true }),
      latencyMs: Date.now() - started,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not execute app action.";
    return NextResponse.json(
      {
        ok: false,
        error: message,
        output: JSON.stringify({ error: message }),
        latencyMs: Date.now() - started,
      },
      { status: 500 },
    );
  }
}
