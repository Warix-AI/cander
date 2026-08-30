/**
 * Factory for the active web research provider.
 * WEB_RESEARCH_PROVIDER=exa|brave — never auto-switch on failure.
 */
import type { WebResearchProvider } from "../../web-research-contract/types.ts";
import {
  braveApiKey,
  exaApiKey,
  webResearchEnabled,
  webResearchProvider,
} from "../../web-research-contract/flags.ts";
import { createExaWebResearchProvider } from "./exa-provider.ts";
import { createBraveWebResearchProvider } from "./brave-provider.ts";

export function getWebResearchProvider(): WebResearchProvider {
  if (!webResearchEnabled()) {
    throw new Error("Web research is disabled.");
  }
  const which = webResearchProvider();
  if (which === "brave") {
    if (!braveApiKey()) throw new Error("BRAVE_SEARCH_API_KEY missing");
    return createBraveWebResearchProvider();
  }
  if (!exaApiKey()) throw new Error("EXA_API_KEY missing");
  return createExaWebResearchProvider();
}

export { createExaWebResearchProvider } from "./exa-provider.ts";
export { createBraveWebResearchProvider } from "./brave-provider.ts";
