/**
 * Semantic response blocks v1 — FM chooses shape; Cander renders.
 * Exactly 8 block types (do not expand without a new plan).
 */

import {
  SEMANTIC_BLOCK_TYPES_V1,
  type SemanticBlock,
  type SemanticBlockType,
  type SemanticResponse,
} from "./types.ts";

const ALLOWED = new Set<string>(SEMANTIC_BLOCK_TYPES_V1);

function asString(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map(asString).filter(Boolean);
}

export function parseSemanticBlock(raw: unknown): SemanticBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const type = String(o.type ?? "") as SemanticBlockType;
  if (!ALLOWED.has(type)) return null;

  switch (type) {
    case "short_answer":
    case "prose":
    case "warning": {
      const text = asString(o.text).trim();
      if (!text) return null;
      return { type, text };
    }
    case "bullet_list":
    case "numbered_steps": {
      const items = asStringArray(o.items);
      if (!items.length) return null;
      return { type, items };
    }
    case "key_value": {
      const pairsRaw = Array.isArray(o.pairs) ? o.pairs : [];
      const pairs = pairsRaw
        .map((p) => {
          if (!p || typeof p !== "object") return null;
          const row = p as Record<string, unknown>;
          const key = asString(row.key).trim();
          const value = asString(row.value).trim();
          if (!key || !value) return null;
          return { key, value };
        })
        .filter(Boolean) as Array<{ key: string; value: string }>;
      if (!pairs.length) return null;
      return { type: "key_value", pairs };
    }
    case "comparison": {
      const columns = asStringArray(o.columns);
      const rowsRaw = Array.isArray(o.rows) ? o.rows : [];
      const rows = rowsRaw
        .map((r) => {
          if (!r || typeof r !== "object") return null;
          const row = r as Record<string, unknown>;
          const label = asString(row.label).trim();
          const values = asStringArray(row.values);
          if (!label) return null;
          return { label, values };
        })
        .filter(Boolean) as Array<{ label: string; values: string[] }>;
      if (!rows.length) return null;
      return { type: "comparison", columns, rows };
    }
    case "source_list": {
      const sourceIds = asStringArray(o.sourceIds);
      return { type: "source_list", sourceIds };
    }
    default:
      return null;
  }
}

export function parseSemanticResponse(raw: unknown): SemanticResponse | null {
  if (!raw || typeof raw !== "object") return null;
  const blocksRaw = (raw as { blocks?: unknown }).blocks;
  if (!Array.isArray(blocksRaw)) return null;
  const blocks: SemanticBlock[] = [];
  for (const b of blocksRaw) {
    const parsed = parseSemanticBlock(b);
    if (parsed) blocks.push(parsed);
  }
  if (!blocks.length) return null;
  return { blocks };
}

/** Flatten blocks to markdown when renderer unavailable / invalid mix. */
export function semanticBlocksToMarkdown(blocks: SemanticBlock[]): string {
  const parts: string[] = [];
  for (const b of blocks) {
    switch (b.type) {
      case "short_answer":
      case "prose":
        parts.push(b.text);
        break;
      case "warning":
        parts.push(`⚠️ ${b.text}`);
        break;
      case "bullet_list":
        parts.push(b.items.map((i) => `• ${i}`).join("\n"));
        break;
      case "numbered_steps":
        parts.push(b.items.map((i, n) => `${n + 1}. ${i}`).join("\n"));
        break;
      case "key_value":
        parts.push(b.pairs.map((p) => `**${p.key}:** ${p.value}`).join("\n"));
        break;
      case "comparison": {
        if (b.columns.length) {
          const header = `| ${b.columns.join(" | ")} |`;
          const sep = `| ${b.columns.map(() => "---").join(" | ")} |`;
          const rows = b.rows.map(
            (r) => `| ${r.label} | ${r.values.join(" | ")} |`,
          );
          parts.push([header, sep, ...rows].join("\n"));
        } else {
          parts.push(
            b.rows
              .map((r) => `**${r.label}:** ${r.values.join(" · ")}`)
              .join("\n"),
          );
        }
        break;
      }
      case "source_list":
        // Renderer owns Sources strip via provenance IDs — skip prose dump.
        break;
    }
  }
  return parts.filter(Boolean).join("\n\n").trim();
}

export function semanticBlocksInstruction(): string {
  return [
    "## Structured output (optional)",
    "When helpful, end with a JSON object on its own line:",
    '{"blocks":[{"type":"short_answer","text":"..."}]}',
    `Allowed block types only: ${SEMANTIC_BLOCK_TYPES_V1.join(", ")}.`,
    "Prefer short_answer + optional comparison/key_value. Do not invent other types.",
  ].join("\n");
}
