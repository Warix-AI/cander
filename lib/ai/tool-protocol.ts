/**
 * Tool-call text protocol helpers (no path aliases — safe for node:test).
 */

export type ParsedToolCall = {
  name: string;
  arguments?: Record<string, unknown>;
};

/** Parse a trailing tool-call JSON object from model output. */
export function parseToolCallFromContent(content: string): {
  text: string;
  call: ParsedToolCall | null;
} {
  const trimmed = content.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```\s*$/i);
  const candidate = fence?.[1]?.trim() ?? trimmed;
  const jsonMatch = candidate.match(
    /\{\s*"tool"\s*:\s*"([^"]+)"\s*,\s*"arguments"\s*:\s*(\{[\s\S]*\})\s*\}\s*$/,
  );
  if (!jsonMatch) {
    const lines = trimmed.split("\n");
    const last = lines[lines.length - 1]?.trim() ?? "";
    if (last.startsWith("{") && last.includes('"tool"')) {
      try {
        const parsed = JSON.parse(last) as {
          tool?: string;
          arguments?: Record<string, unknown>;
        };
        if (parsed.tool) {
          const text = lines.slice(0, -1).join("\n").trim();
          return {
            text,
            call: { name: parsed.tool, arguments: parsed.arguments ?? {} },
          };
        }
      } catch {
        // fall through
      }
    }
    return { text: trimmed, call: null };
  }
  try {
    const args = JSON.parse(jsonMatch[2]!) as Record<string, unknown>;
    const text = trimmed
      .slice(0, trimmed.lastIndexOf(jsonMatch[0]!))
      .replace(/```(?:json)?\s*$/i, "")
      .trim();
    return {
      text,
      call: { name: jsonMatch[1]!, arguments: args },
    };
  } catch {
    return { text: trimmed, call: null };
  }
}
