/**
 * Convert CanderTool definitions to OpenAI Responses API function tools.
 */

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
    name: tool.id,
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
