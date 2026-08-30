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
