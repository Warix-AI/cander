/**
 * Google Docs ConnectorViewAdapter — search / open / create via Composio.
 */

import { executeConnectorTool } from "../tool-execute.ts";
import { createSupabaseAdminClient } from "../../supabase/admin.ts";
import type {
  ActionContext,
  ActionResult,
  ConnectorViewAdapter,
  SyncContext,
  SyncResult,
} from "./types.ts";

function pickString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function parseToolJson(output: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(output) as unknown;
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* ignore */
  }
  return {};
}

async function runTool(
  ctx: ActionContext | SyncContext,
  tool: string,
  args: Record<string, unknown>,
  confirmed = false,
) {
  const admin = createSupabaseAdminClient();
  return executeConnectorTool({
    client: admin,
    workspaceId: ctx.workspaceId,
    profileId: ctx.profileId,
    tool,
    arguments: args,
    connectionId: ctx.connectionId,
    confirmed,
  });
}

function extractList(payload: Record<string, unknown>): unknown[] {
  if (Array.isArray(payload.files)) return payload.files;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.documents)) return payload.documents;
  const data = payload.data;
  if (data && typeof data === "object") {
    const inner = data as Record<string, unknown>;
    if (Array.isArray(inner.files)) return inner.files;
    if (Array.isArray(inner.items)) return inner.items;
    if (Array.isArray(inner.documents)) return inner.documents;
  }
  return [];
}

function extractDocumentBody(payload: Record<string, unknown>): string | null {
  const direct = pickString(
    payload.markdown,
    payload.markdown_text,
    payload.text,
    payload.content,
    payload.body,
  );
  if (direct) return direct;

  const data = payload.data;
  if (data && typeof data === "object") {
    return extractDocumentBody(data as Record<string, unknown>);
  }

  // Google Docs API structured body — flatten plain text runs when present.
  const body = payload.body;
  if (body && typeof body === "object") {
    const content = (body as Record<string, unknown>).content;
    if (Array.isArray(content)) {
      const parts: string[] = [];
      for (const block of content) {
        if (!block || typeof block !== "object") continue;
        const paragraph = (block as Record<string, unknown>).paragraph;
        if (!paragraph || typeof paragraph !== "object") continue;
        const elements = (paragraph as Record<string, unknown>).elements;
        if (!Array.isArray(elements)) continue;
        for (const el of elements) {
          if (!el || typeof el !== "object") continue;
          const textRun = (el as Record<string, unknown>).textRun;
          if (!textRun || typeof textRun !== "object") continue;
          const text = pickString((textRun as Record<string, unknown>).content);
          if (text) parts.push(text);
        }
      }
      if (parts.length) return parts.join("");
    }
  }

  return null;
}

export function embedUrlForGoogleDoc(documentId: string): string {
  return `https://docs.google.com/document/d/${encodeURIComponent(documentId)}/preview`;
}

export function openUrlForGoogleDoc(documentId: string): string {
  return `https://docs.google.com/document/d/${encodeURIComponent(documentId)}/edit`;
}

export const gdocsViewAdapter: ConnectorViewAdapter = {
  connectorId: "gdocs",
  capabilities: {
    sync: false,
    list: true,
  },

  async sync(_ctx: SyncContext): Promise<SyncResult> {
    return { upserted: [], cursor: null, providerState: {} };
  },

  async executeAction(
    action: string,
    input: unknown,
    ctx: ActionContext,
  ): Promise<ActionResult> {
    const args =
      input && typeof input === "object"
        ? (input as Record<string, unknown>)
        : {};

    try {
      switch (action) {
        case "searchDocuments": {
          const result = await runTool(ctx, "gdocs.search", args);
          if (!result.ok) return { ok: false, error: result.error };
          const payload = parseToolJson(result.output);
          return {
            ok: true,
            data: {
              documents: extractList(payload),
              raw: payload,
            },
          };
        }
        case "getDocument": {
          const documentId = pickString(
            args.documentId,
            args.document_id,
            args.id,
          );
          if (!documentId) {
            return { ok: false, error: "Missing document id." };
          }
          const result = await runTool(ctx, "gdocs.get", { documentId });
          if (!result.ok) return { ok: false, error: result.error };
          const payload = parseToolJson(result.output);
          const title =
            pickString(payload.title, payload.name) ||
            pickString(
              (payload.data as Record<string, unknown> | undefined)?.title,
              (payload.data as Record<string, unknown> | undefined)?.name,
            ) ||
            "Document";
          return {
            ok: true,
            data: {
              id: documentId,
              title,
              bodyText: extractDocumentBody(payload),
              embedUrl: embedUrlForGoogleDoc(documentId),
              openUrl: openUrlForGoogleDoc(documentId),
              raw: payload,
            },
          };
        }
        case "createDocument": {
          const title = pickString(args.title, args.name);
          if (!title) return { ok: false, error: "Missing title." };
          const markdown =
            pickString(args.markdown, args.markdown_text, args.body) || "";
          const result = await runTool(
            ctx,
            "gdocs.createMarkdown",
            { title, markdown },
            true,
          );
          if (!result.ok) return { ok: false, error: result.error };
          return { ok: true, data: parseToolJson(result.output) };
        }
        default:
          return { ok: false, error: `Unsupported action: ${action}` };
      }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Operation failed.",
      };
    }
  },
};
