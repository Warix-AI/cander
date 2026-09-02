/**
 * Convert CanderTool definitions to OpenAI Responses API function tools.
 */

import { listCanderTools } from "./cander-registry.ts";
import type { CanderTool } from "./types.ts";

export type OpenAIFunctionTool = {
  type: "function";
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
  strict: boolean | null;
};

/** OpenAI function names must match ^[a-zA-Z0-9_-]+$ — no dots. */
export function toOpenAIToolName(toolId: string): string {
  return toolId.replace(/\./g, "_");
}

export function fromOpenAIToolName(openaiName: string): string {
  for (const tool of listCanderTools()) {
    if (toOpenAIToolName(tool.id) === openaiName) return tool.id;
  }
  // Fallback for unknown names: first underscore → connector.action
  const first = openaiName.indexOf("_");
  if (first <= 0) return openaiName;
  return `${openaiName.slice(0, first)}.${openaiName.slice(first + 1)}`;
}

export function canderToolToOpenAIFunction(tool: CanderTool): OpenAIFunctionTool {
  const properties: Record<string, unknown> = {};
  for (const [key, prop] of Object.entries(tool.inputSchema.properties)) {
    properties[key] = {
      type: prop.type,
      ...(prop.description ? { description: prop.description } : {}),
      ...(prop.enum ? { enum: prop.enum } : {}),
      ...(prop.items ? { items: prop.items } : {}),
    };
  }
  return {
    type: "function",
    name: toOpenAIToolName(tool.id),
    description: tool.description,
    parameters: {
      type: "object",
      properties,
      ...(tool.inputSchema.required?.length
        ? { required: tool.inputSchema.required }
        : {}),
      additionalProperties: false,
    },
    strict: null,
  };
}

export function canderToolsToOpenAIFunctions(tools: CanderTool[]): OpenAIFunctionTool[] {
  return tools.map(canderToolToOpenAIFunction);
}
