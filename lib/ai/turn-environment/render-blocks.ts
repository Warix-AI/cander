/**
 * Map semantic response blocks → ChatBlock / markdown for the existing UI.
 */

import type { ChatBlock } from "@/lib/types";
import type { SemanticBlock } from "./types.ts";
import { semanticBlocksToMarkdown } from "./semantic.ts";

export function semanticBlocksToChatBlocks(
  blocks: SemanticBlock[],
): ChatBlock[] {
  const out: ChatBlock[] = [];
  for (const b of blocks) {
    switch (b.type) {
      case "short_answer":
      case "prose":
        out.push({ type: "text", text: b.text });
        break;
      case "warning":
        out.push({ type: "error", title: "Note", body: b.text });
        break;
      case "bullet_list":
        out.push({
          type: "text",
          text: b.items.map((i) => `• ${i}`).join("\n"),
        });
        break;
      case "numbered_steps":
        out.push({
          type: "plan",
          title: "Steps",
          steps: b.items,
        });
        break;
      case "key_value":
        out.push({
          type: "text",
          text: b.pairs.map((p) => `**${p.key}:** ${p.value}`).join("\n"),
        });
        break;
      case "comparison": {
        const md = semanticBlocksToMarkdown([b]);
        out.push({ type: "text", text: md });
        break;
      }
      case "source_list":
        // Provenance IDs bind to Message.citations — SourcesStrip renders them.
        break;
    }
  }
  return out;
}
