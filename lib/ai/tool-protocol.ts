/**
 * Tool-call text protocol helpers (no path aliases — safe for node:test).
 * Visible assistant text must never include tools, JSON, or internal payloads.
 */

import { stripInlineCitationMarkers } from "./orchestrator/citations.ts";

export type ParsedToolCall = {
  name: string;
  arguments?: Record<string, unknown>;
};

const KNOWN_TOOLS =
  "nav\\.open|project\\.(?:create|open)|panel\\.(?:open|close)|workspace\\.search|knowledge\\.search|web\\.(?:search|open)|ui\\.(?:ask_clarification|confirm)|create_work_task|check_work_task|request_publish_approval|gmail\\.(?:search|read|send)";

const KNOWN_TOOL_NAME_RE =
  /^(nav\.open|project\.(create|open)|panel\.(open|close)|workspace\.search|knowledge\.search|web\.(search|open)|ui\.(ask_clarification|confirm)|create_work_task|check_work_task|request_publish_approval|gmail\.(search|read|send))$/;

/** Soft-repair common model JSON mistakes (trailing commas). */
export function repairJson(raw: string): string {
  return raw.replace(/,\s*([}\]])/g, "$1");
}

/**
 * Hard sanitize for anything the user might see.
 * Prefer this over stripToolJsonFromText at UI/Edge boundaries.
 */
export function sanitizeAssistantVisibleText(content: string): string {
  let text = (content || "").trim();
  if (!text) return "";

  // Fenced JSON / tool blocks anywhere
  text = text.replace(/```(?:json)?\s*\{[\s\S]*?\}\s*```/gi, "");

  // Canonical tool objects (greedy-ish balanced via non-greedy inner)
  text = text.replace(
    /\{\s*"tool"\s*:\s*"[^"]+"\s*,\s*"arguments"\s*:\s*\{[\s\S]*?\}\s*\}\s*/g,
    "",
  );
  text = text.replace(
    /\{\s*"name"\s*:\s*"[^"]+"\s*,\s*"(?:arguments|args)"\s*:\s*\{[\s\S]*?\}\s*\}\s*/g,
    "",
  );

  // Key-style {"ui.ask_clarification":{...}} etc.
  text = text.replace(
    new RegExp(
      `\\{\\s*"(?:${KNOWN_TOOLS})"\\s*:\\s*\\{[\\s\\S]*?\\}\\s*\\}\\s*`,
      "gi",
    ),
    "",
  );
  text = text.replace(/\{\s*"error"\s*:\s*"[^"]*"\s*\}\s*/gi, "");

  // Prose tool dumps: ui.ask_clarification { ... } / `nav.open { ... }`
  text = text.replace(
    new RegExp(
      `\`?\\s*(?:${KNOWN_TOOLS})\\s*\\{[\\s\\S]*?\\}\\s*\`?`,
      "gi",
    ),
    "",
  );

  // “Calling tool…” / “Using tool …” lines
  text = text.replace(
    /^(?:calling|using|running|invoking)\s+tool[^\n]*$/gim,
    "",
  );
  text = text.replace(
    new RegExp(`^(?:${KNOWN_TOOLS})\\s*(?:…|\\.\\.\\.)?\\s*$`, "gim"),
    "",
  );

  // Incomplete / dangling JSON that still looks like a tool payload
  text = text.replace(/\{[^{}]*"(?:tool|arguments|ui\.ask_clarification)"[^{}]*(?:\{[\s\S]*)?$/gim, "");
  text = text.replace(/\{[\s\S]*"(?:tool|arguments)"[\s\S]*$/g, (chunk) => {
    // If the remainder never closed cleanly, drop it
    const opens = (chunk.match(/\{/g) || []).length;
    const closes = (chunk.match(/\}/g) || []).length;
    return opens > closes ? "" : chunk;
  });

  // Line filter for leftover internals
  text = text
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (!t) return true;
      if (/^```/.test(t)) return false;
      if (t.startsWith("{") && /"(?:tool|arguments|error)"/.test(t)) return false;
      if (new RegExp(`^(?:${KNOWN_TOOLS})\\b`, "i").test(t) && t.includes("{")) {
        return false;
      }
      if (/^(?:workspace_id|project_id|thread_id)\s*[:=]/i.test(t)) return false;
      if (/^\[(?:system|internal|debug)\]/i.test(t)) return false;
      return true;
    })
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Final pass: any remaining balanced tool-looking object
  text = text.replace(
    /\{\s*"(?:tool|name)"\s*:\s*"[^"]+"[\s\S]*?\}\s*/g,
    "",
  );

  return stripInlineCitationMarkers(text).trim();
}

/** @deprecated Prefer sanitizeAssistantVisibleText */
export function stripToolJsonFromText(content: string): string {
  return sanitizeAssistantVisibleText(content);
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
      if (!KNOWN_TOOL_NAME_RE.test(name)) {
        continue;
      }
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
  // Key-style {"nav.open": {...}}
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const keys = Object.keys(parsed);
        if (keys.length === 1) {
          const name = keys[0]!;
          if (KNOWN_TOOL_NAME_RE.test(name)) {
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
 * Extract the last validated tool object from model output.
 * Visible text is always sanitized — never leaks raw payloads.
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
    if (/"tool"\s*:/.test(inner) || new RegExp(`"(?:${KNOWN_TOOLS})"\\s*:`).test(inner)) {
      searchIn = inner.trim();
    }
  }

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
      new RegExp(`"(?:${KNOWN_TOOLS})"\\s*:`).test(slice)
    ) {
      objects.push(slice);
    }
    i = end;
  }

  for (let i = objects.length - 1; i >= 0; i--) {
    const call = tryParseToolObject(objects[i]!);
    if (call) {
      return { text: sanitizeAssistantVisibleText(trimmed), call };
    }
  }

  const lines = trimmed.split("\n");
  const last = lines[lines.length - 1]?.trim() ?? "";
  if (
    last.startsWith("{") &&
    (/"tool"\s*:/.test(last) ||
      /"name"\s*:/.test(last) ||
      new RegExp(`"(?:${KNOWN_TOOLS})"\\s*:`).test(last))
  ) {
    const call = tryParseToolObject(last);
    if (call) {
      return {
        text: sanitizeAssistantVisibleText(lines.slice(0, -1).join("\n")),
        call,
      };
    }
  }

  // Unparseable tool-shaped output — strip, do not execute
  if (
    /"tool"\s*:/.test(trimmed) ||
    new RegExp(`"(?:${KNOWN_TOOLS})"\\s*:`).test(trimmed) ||
    new RegExp(`(?:${KNOWN_TOOLS})\\s*\\{`, "i").test(trimmed)
  ) {
    return { text: sanitizeAssistantVisibleText(trimmed), call: null };
  }

  return { text: sanitizeAssistantVisibleText(trimmed), call: null };
}
