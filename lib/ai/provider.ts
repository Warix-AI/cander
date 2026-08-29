import type { AiProvider, AiProviderId } from "@/lib/ai/types";
import { ACTIVE_AI_PROVIDER_ID } from "@/lib/ai/types";
import { createOllamaBridgeProvider } from "@/lib/ai/providers/ollama-bridge";

const providers = new Map<AiProviderId, AiProvider>();

export function registerAiProvider(provider: AiProvider) {
  providers.set(provider.id, provider);
}

export function getAiProvider(id: AiProviderId = ACTIVE_AI_PROVIDER_ID): AiProvider {
  const existing = providers.get(id);
  if (existing) return existing;
  if (id === "ollama-bridge") {
    const created = createOllamaBridgeProvider();
    providers.set(id, created);
    return created;
  }
  throw new Error(`Unknown AI provider: ${id}`);
}

export function listAiProviders(): AiProvider[] {
  getAiProvider(ACTIVE_AI_PROVIDER_ID);
  return [...providers.values()];
}
