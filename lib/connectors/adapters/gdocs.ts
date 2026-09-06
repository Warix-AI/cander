/**
 * Google Docs connector adapter — Composio slug/arg/result mapping.
 */

import { GDOCS_COMPOSIO_SLUGS } from "../google-workspace-composio.ts";
import {
  buildSuccessResult,
  pickString,
  unwrapProviderData,
  type ConnectorAdapter,
} from "./types.ts";

type GdocsToolName = keyof typeof GDOCS_COMPOSIO_SLUGS;

function isGdocsTool(toolId: string): toolId is GdocsToolName {
  return toolId in GDOCS_COMPOSIO_SLUGS;
}

function mapGdocsArguments(
  toolId: GdocsToolName,
  args: Record<string, unknown>,
): Record<string, unknown> {
  if (toolId === "gdocs.search") {
    const out: Record<string, unknown> = {
      max_results: Math.min(100, Math.max(1, Number(args.maxResults) || 20)),
      order_by: pickString(args.orderBy, args.order_by) || "modifiedTime desc",
    };
    const query = pickString(args.query, args.q);
    if (query) {
      out.query =
        /contains|trashed|=/i.test(query) ? query : `name contains '${query.replace(/'/g, "\\'")}'`;
    }
    return out;
  }

  if (toolId === "gdocs.get") {
    const id = pickString(args.documentId, args.document_id, args.id);
    if (!id) throw new Error("Missing required argument: documentId");
    return { id };
  }

  if (toolId === "gdocs.create") {
    const title = pickString(args.title, args.name);
    if (!title) throw new Error("Missing required argument: title");
    return { title };
  }

  if (toolId === "gdocs.createMarkdown") {
    const title = pickString(args.title, args.name);
    if (!title) throw new Error("Missing required argument: title");
    return {
      title,
      markdown_text: pickString(args.markdown, args.markdown_text, args.body) || "",
    };
  }

  if (toolId === "gdocs.updateMarkdown") {
    const documentId = pickString(args.documentId, args.document_id, args.id);
    if (!documentId) throw new Error("Missing required argument: documentId");
    const markdown = pickString(args.markdown, args.markdown_text, args.new_markdown_text);
    if (markdown == null) throw new Error("Missing required argument: markdown");
    return {
      document_id: documentId,
      new_markdown_text: markdown,
    };
  }

  if (toolId === "gdocs.insertText") {
    return { ...args };
  }

  return { ...args };
}

export const gdocsAdapter: ConnectorAdapter = {
  connectorId: "gdocs",

  mapArguments(toolId, args) {
    if (!isGdocsTool(toolId)) {
      throw new Error(`Unsupported Docs tool: ${toolId}`);
    }
    return mapGdocsArguments(toolId, args);
  },

  providerSlug(toolId) {
    if (!isGdocsTool(toolId)) {
      throw new Error(`Unsupported Docs tool: ${toolId}`);
    }
    return GDOCS_COMPOSIO_SLUGS[toolId];
  },

  normalizeResult(input) {
    if (!isGdocsTool(input.toolId)) {
      throw new Error(`Unsupported Docs tool: ${input.toolId}`);
    }
    const data = unwrapProviderData(input.raw);
    return buildSuccessResult({
      toolId: input.toolId,
      toolCallId: input.toolCallId,
      idempotencyKey: input.idempotencyKey,
      connectionId: input.connectionId,
      data,
    });
  },
};
