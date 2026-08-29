/**
 * Tool-call text protocol helpers (no path aliases — safe for node:test).
 */

export type ParsedToolCall = {
  name: string;
  arguments?: Record<string, unknown>;
};

/** Soft-repair common model JSON mistakes (trailing commas). */
export function repairJson(raw: string): string {
  return raw.replace(/,\s*([}\]])/g, "$1");
}

/** Remove tool-call JSON objects (and trailing error blobs) from assistant text. */
export function stripToolJsonFromText(content: string): string {
  let text = content.trim();
  // Fenced tool blocks at the end
  text = text.replace(/```(?:json)?\s*\{[\s\S]*?"tool"\s*:[\s\S]*?\}\s*```\s*$/i, "");
  // Canonical tool objects
  text = text.replace(
    /\{\s*"tool"\s*:\s*"[^"]+"\s*,\s*"arguments"\s*:\s*\{[\s\S]*?\}\s*\}\s*/g,
    "",
  );
  // Malformed {"nav.open": {...}} / {"project.create": {...}}
  text = text.replace(
    /\{\s*"(?:nav\.open|project\.(?:create|open)|panel\.(?:open|close)|workspace\.search|ui\.(?:ask_clarification|confirm))"\s*:\s*\{[\s\S]*?\}\s*\}\s*/g,
    "",
  );
  text = text.replace(/\{\s*"error"\s*:\s*"[^"]*"\s*\}\s*/g, "");
  // Inline tool prose models sometimes dump as “buttons”
  text = text.replace(
    /`?\s*nav\.open\s*\{\s*"target"\s*:\s*"[^"]+"\s*\}\s*`?/gi,
    "",
  );
  text = text.replace(
    /`?\s*\{\s*"tool"\s*:\s*"[^"]+"\s*,\s*"arguments"\s*:\s*\{[\s\S]*?\}\s*\}\s*`?/g,
    "",
  );
  // Leftover bare tool lines
  text = text
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (!t.startsWith("{") && !t.startsWith("`")) return true;
      if (t.includes('"tool"') || t.includes('"error"')) return false;
      if (/nav\.open|project\.(create|open)/i.test(t) && t.includes("{")) {
        return false;
      }
      return true;
    })
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text;
}

function tryParseToolObject(raw: string): ParsedToolCall | null {
  const candidates = [raw.trim(), repairJson(raw.trim())];
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as {
        tool?: string;
        name?: string;
        arguments?: Record<string, unknown>;
        args?: Record<string, unknown>;
      };
      const name = parsed.tool ?? parsed.name;
      if (!name || typeof name !== "string") continue;
      const args = parsed.arguments ?? parsed.args ?? {};
      return {
        name,
        arguments:
          args && typeof args === "object" && !Array.isArray(args)
            ? (args as Record<string, unknown>)
            : {},
      };
    } catch {
      // try next
    }
  }
  // Malformed {"nav.open": {...}} style — treat tool name as the key
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const keys = Object.keys(parsed);
        if (keys.length === 1) {
          const name = keys[0]!;
          if (/^(nav\.open|project\.(create|open)|panel\.(open|close)|workspace\.search|ui\.(ask_clarification|confirm))$/.test(name)) {
            const args = parsed[name];
            return {
              name,
              arguments:
                args && typeof args === "object" && !Array.isArray(args)
                  ? (args as Record<string, unknown>)
                  : {},
            };
          }
        }
      }
    } catch {
      // try next
    }
  }
  return null;
}

/**
 * Extract the last {"tool":...} object from model output.
 * Ignores trailing {"error":...} junk. Visible text never includes tool JSON.
 */
export function parseToolCallFromContent(content: string): {
  text: string;
  call: ParsedToolCall | null;
} {
  const trimmed = content.trim();
  if (!trimmed) return { text: "", call: null };

  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/gi);
  let searchIn = trimmed;
  if (fence?.length) {
    const lastFence = fence[fence.length - 1]!;
    const inner = lastFence.replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
    if (inner.includes('"tool"')) searchIn = inner.trim();
  }

  // Collect brace-balanced objects that look like tool calls
  const objects: string[] = [];
  for (let i = 0; i < searchIn.length; i++) {
    if (searchIn[i] !== "{") continue;
    let depth = 0;
    let end = -1;
    for (let j = i; j < searchIn.length; j++) {
      const ch = searchIn[j];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          end = j;
          break;
        }
      }
    }
    if (end < 0) break;
    const slice = searchIn.slice(i, end + 1);
    if (
      /"tool"\s*:/.test(slice) ||
      /"name"\s*:\s*"[a-z][a-z0-9_.-]*"/i.test(slice) ||
      /"(nav\.open|project\.(create|open)|panel\.(open|close)|workspace\.search)"\s*:/.test(
        slice,
      )
    ) {
      objects.push(slice);
    }
    i = end;
  }

  // Prefer last tool-shaped object
  for (let i = objects.length - 1; i >= 0; i--) {
    const call = tryParseToolObject(objects[i]!);
    if (call) {
      const text = stripToolJsonFromText(trimmed);
      return { text, call };
    }
  }

  // Last-line fallback
  const lines = trimmed.split("\n");
  const last = lines[lines.length - 1]?.trim() ?? "";
  if (last.startsWith("{") && (last.includes('"tool"') || last.includes('"name"'))) {
    const call = tryParseToolObject(last);
    if (call) {
      return {
        text: stripToolJsonFromText(lines.slice(0, -1).join("\n")),
        call,
      };
    }
  }

  // Looks like tool JSON but unparseable — still strip so UI never shows it
  if (
    /"tool"\s*:/.test(trimmed) ||
    /"(nav\.open|project\.(create|open))"\s*:/.test(trimmed)
  ) {
    return { text: stripToolJsonFromText(trimmed), call: null };
  }

  return { text: trimmed, call: null };
}
