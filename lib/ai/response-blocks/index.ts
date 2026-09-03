/**
 * Central response-block registry — types, parse, markdown, instructions.
 */

export {
  RESPONSE_FORMAT_VERSION,
  RESPONSE_BLOCK_TYPES,
  RESPONSE_BLOCK_TYPES_V2,
  isKnownResponseBlockType,
  richResponseFormatInstruction,
  type ResponseBlockType,
  type ResponseBlockTypeV2,
  type RichResponseBlock,
  type RichResponseBlockV2,
  type RichResponse,
  type RichResponseV2,
  type ProcessStep,
  type HierarchyNode,
  type DecisionCriterion,
  type DecisionScore,
  type RankingItem,
  type StatusItem,
  type FaqItem,
} from "./types.ts";

export {
  parseRichBlock,
  validateRichResponse,
  coerceRichResponse,
  richBlockToMarkdown,
  richResponseToMarkdown,
  type ValidatedRichResponse,
} from "./parse.ts";
