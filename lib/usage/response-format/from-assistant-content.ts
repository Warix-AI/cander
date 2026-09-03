import { coerceRichResponse } from "./schema-v2.ts";
import { richBlocksToChatBlocks } from "./to-chat-blocks.ts";
import type { ChatBlock } from "../../types.ts";
import { stripInlineCitationMarkers } from "../../ai/orchestrator/citations.ts";

export type ParsedAssistantContent = {
  content: string;
  blocks?: ChatBlock[];
};

/** Parse optional v2 structured JSON embedded in assistant text. */
export function parseAssistantRichContent(raw: string): ParsedAssistantContent {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) {
    return { content: stripInlineCitationMarkers(raw) };
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const coerced = coerceRichResponse(parsed, trimmed);
    if (typeof coerced === "string") {
      return { content: stripInlineCitationMarkers(coerced) };
    }
    const blocks = richBlocksToChatBlocks(coerced);
    const textBlock = coerced.blocks.find(
      (block) =>
        block.type === "markdown" ||
        block.type === "text" ||
        block.type === "summary",
    );
    const content =
      textBlock && "markdown" in textBlock
        ? String(textBlock.markdown)
        : textBlock && "text" in textBlock
          ? String(textBlock.text)
          : textBlock && "body" in textBlock
            ? String(textBlock.body)
            : blocks.length
              ? ""
              : raw;
    return {
      content: stripInlineCitationMarkers(content),
      blocks: blocks.length ? blocks : undefined,
    };
  } catch {
    return { content: stripInlineCitationMarkers(raw) };
  }
}
