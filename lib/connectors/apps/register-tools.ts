/**
 * Register CanderTools for non-Google app connectors.
 */

import type { CanderTool } from "../../ai/tools/types.ts";
import { APP_CONNECTOR_DEFINITIONS } from "./definitions.ts";

export function registerAppConnectorTools(
  registerCanderTool: (tool: CanderTool) => void,
) {
  for (const def of APP_CONNECTOR_DEFINITIONS) {
    const family =
      def.category === "Commerce" ? "commerce" : ("files" as const);

    registerCanderTool({
      id: `${def.id}.list`,
      connectorId: def.id,
      capabilityFamily: family === "commerce" ? "commerce" : "files",
      category: "productivity",
      label: `List ${def.itemNoun}`,
      description: `List ${def.itemNoun} from connected ${def.name}.`,
      risk: "read",
      confirmationPolicy: "never",
      defaultEnabled: true,
      providerTool: def.listProvider,
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Optional search query." },
        },
      },
    });

    if (def.searchProvider) {
      registerCanderTool({
        id: `${def.id}.search`,
        connectorId: def.id,
        capabilityFamily: family === "commerce" ? "commerce" : "files",
        category: "productivity",
        label: `Search ${def.itemNoun}`,
        description: `Search ${def.itemNoun} in connected ${def.name}.`,
        risk: "read",
        confirmationPolicy: "never",
        defaultEnabled: true,
        providerTool: def.searchProvider,
        inputSchema: {
          type: "object",
          required: ["query"],
          properties: {
            query: { type: "string", description: "Search query." },
          },
        },
      });
    }

    if (def.getProvider) {
      registerCanderTool({
        id: `${def.id}.get`,
        connectorId: def.id,
        capabilityFamily: family === "commerce" ? "commerce" : "files",
        category: "productivity",
        label: `Open ${def.itemNoun.replace(/s$/, "") || "item"}`,
        description: `Fetch one ${def.name} item by id.`,
        risk: "read",
        confirmationPolicy: "never",
        defaultEnabled: true,
        providerTool: def.getProvider,
        inputSchema: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string", description: "Item id." },
          },
        },
      });
    }

    for (const extra of def.extraTools ?? []) {
      registerCanderTool({
        id: `${def.id}.${extra.id}`,
        connectorId: def.id,
        capabilityFamily: family === "commerce" ? "commerce" : "files",
        category: "productivity",
        label: extra.label,
        description: extra.description,
        risk: extra.risk ?? "read",
        confirmationPolicy: extra.confirmationPolicy ?? "never",
        defaultEnabled: true,
        providerTool: extra.providerTool,
        inputSchema: extra.inputSchema,
      });
    }
  }
}
