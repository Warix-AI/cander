/**
 * Client-safe re-exports of the shared web-research contract.
 * Source of truth: supabase/functions/_shared/web-research-contract/
 * Do not import EXA_API_KEY or Edge flag helpers from client bundles.
 */

export type {
  WebSource,
  WebEvidence,
  WebSearchInput,
  WebReadInput,
  WebResearchInput,
  WebResearchProvider,
  WebResearchProviderId,
  WebResearchMode,
  WebDeepLevel,
  WebSourceType,
  ExaGroundingField,
} from "../../../supabase/functions/_shared/web-research-contract/types.ts";

export {
  WEB_RESEARCH_LIMITS,
  domainFromUrl,
  canonicalUrl,
  sanitizeHttpUrl,
  isPrivateOrBlockedHost,
  assertPublicHttpUrl,
  dedupeSources,
  makeWebSource,
  evidenceTextFromSources,
  isFreshnessQuery,
} from "../../../supabase/functions/_shared/web-research-contract/types.ts";

export {
  wantsAutonomousResearch,
  wantsDeepReasoningSearch,
  resolveExaRetrievalPolicy,
  buildExaOutputSchema,
  buildRetrievalQuery,
  exaDirectAnswerText,
  exaGroundingConfidence,
  nextEscalationMode,
  EXA_SEARCH_SYSTEM_PROMPT,
} from "../../../supabase/functions/_shared/web-research-contract/retrieval-policy.ts";

export type {
  ExaRetrievalMode,
  ExaRetrievalPolicy,
  TurnRetrievalHints,
} from "../../../supabase/functions/_shared/web-research-contract/retrieval-policy.ts";

export {
  parseExaSynthesizedResponse,
  exaBundleQualityOk,
  evaluateExaSynthesisQuality,
} from "../../../supabase/functions/_shared/web-research-contract/exa-synthesized.ts";

export type { ExaSearchBundle as EdgeExaSearchBundle } from "../../../supabase/functions/_shared/web-research-contract/exa-synthesized.ts";

export {
  parseExaSearchBundle,
  exaBundleUsable,
} from "./evidence-bundle.ts";
export type { ExaSearchBundle } from "./evidence-bundle.ts";
