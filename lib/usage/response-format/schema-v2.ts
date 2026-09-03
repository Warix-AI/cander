/**
 * Rich AI response format v2 — thin re-export over the central registry.
 * Prefer importing from `lib/ai/response-blocks` for new code.
 * Relative imports keep Node strip-types tests working without path aliases.
 */

export {
  RESPONSE_FORMAT_VERSION,
  RESPONSE_BLOCK_TYPES_V2,
  type ResponseBlockTypeV2,
  type RichResponseBlockV2,
  type RichResponseV2,
  type ValidatedRichResponse,
  validateRichResponse,
  coerceRichResponse,
  richResponseToMarkdown,
  richResponseFormatInstruction,
} from "../../ai/response-blocks/index.ts";

import { parseRichBlock } from "../../ai/response-blocks/index.ts";

/** @deprecated Use parseRichBlock */
export function parseBlock(raw: unknown) {
  return parseRichBlock(raw);
}
