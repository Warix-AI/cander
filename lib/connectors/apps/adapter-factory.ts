/**
 * Factory: ConnectorAdapter for app connectors (argument passthrough + provider slug).
 */

import {
  APP_CONNECTOR_DEFINITIONS,
  appConnectorById,
} from "./definitions.ts";
import {
  buildSuccessResult,
  unwrapProviderData,
  type ConnectorAdapter,
} from "../adapters/types.ts";

export function createAppConnectorAdapter(connectorId: string): ConnectorAdapter {
  const def = appConnectorById(connectorId);
  if (!def) throw new Error(`Unknown app connector: ${connectorId}`);

  const listToolId = `${connectorId}.list`;
  const searchToolId = `${connectorId}.search`;
  const getToolId = `${connectorId}.get`;
  const extraById = new Map(
    (def.extraTools ?? []).map((tool) => [`${connectorId}.${tool.id}`, tool]),
  );

  return {
    connectorId,

    mapArguments(toolId, args) {
      if (toolId === listToolId || toolId === searchToolId) {
        const out: Record<string, unknown> = { ...(def.listArgs ?? {}) };
        const q =
          typeof args.query === "string"
            ? args.query.trim()
            : typeof args.q === "string"
              ? args.q.trim()
              : "";

        if (q && def.mapSearchQuery) {
          Object.assign(out, def.mapSearchQuery(q));
        } else if (q && def.searchArg) {
          out[def.searchArg] = q;
        }

        // Search-specific provider may need only search args (Linear).
        if (toolId === searchToolId && def.searchProvider) {
          const searchOut: Record<string, unknown> = { first: 40 };
          if (def.mapSearchQuery && q) {
            Object.assign(searchOut, def.mapSearchQuery(q));
          } else if (def.searchArg && q) {
            searchOut[def.searchArg] = q;
          }
          if (!q && def.searchArg) {
            throw new Error(`Missing required argument: ${def.searchArg}`);
          }
          return searchOut;
        }

        for (const [key, value] of Object.entries(args)) {
          if (key === "query" || key === "q") continue;
          if (value !== undefined && value !== null && value !== "") {
            out[key] = value;
          }
        }
        return out;
      }
      if (toolId === getToolId && def.getProvider && def.getIdArg) {
        const id =
          (typeof args.id === "string" && args.id) ||
          (typeof args[def.getIdArg] === "string" &&
            (args[def.getIdArg] as string)) ||
          "";
        if (!id) throw new Error(`Missing required argument: ${def.getIdArg}`);
        const out: Record<string, unknown> = { [def.getIdArg]: id };
        // HubSpot detail benefits from the same property set as list.
        if (connectorId === "hubspot") {
          out.properties = [
            "email",
            "firstname",
            "lastname",
            "company",
            "jobtitle",
            "phone",
            "lastmodifieddate",
            "createdate",
          ];
        }
        return out;
      }

      const extra = extraById.get(toolId);
      if (extra) {
        const out: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(args)) {
          if (value !== undefined && value !== null && value !== "") {
            out[key] = value;
          }
        }
        for (const key of extra.inputSchema.required ?? []) {
          if (out[key] === undefined || out[key] === null || out[key] === "") {
            throw new Error(`Missing required argument: ${key}`);
          }
        }
        if (
          (toolId.endsWith(".listInvoices") ||
            toolId.endsWith(".listCharges") ||
            toolId.endsWith(".listPaymentIntents") ||
            toolId.endsWith(".listProducts") ||
            toolId.endsWith(".listPrices") ||
            toolId.endsWith(".listSubscriptions")) &&
          out.limit === undefined
        ) {
          out.limit = 40;
        }
        return out;
      }

      throw new Error(`Unsupported ${connectorId} tool: ${toolId}`);
    },

    providerSlug(toolId) {
      if (toolId === listToolId) return def.listProvider;
      if (toolId === searchToolId && def.searchProvider) return def.searchProvider;
      if (toolId === getToolId && def.getProvider) return def.getProvider;
      const extra = extraById.get(toolId);
      if (extra) return extra.providerTool;
      throw new Error(`Unsupported ${connectorId} tool: ${toolId}`);
    },

    normalizeResult(input) {
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
}

export const APP_CONNECTOR_ADAPTERS = APP_CONNECTOR_DEFINITIONS.map((def) =>
  createAppConnectorAdapter(def.id),
);
