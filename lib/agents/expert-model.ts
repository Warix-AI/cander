/**
 * Locked model for Expert / project_agent runs (chat, schedule, consult, voice).
 * Normal Cander chat keeps resolveOpenAIModel().
 */

export const EXPERT_MODEL_ID = "gpt-5.6-luna";

export const DEFAULT_EXPERT_DELIVERY = {
  channels: ["expert_chat", "overview"] as string[],
};

export type ExpertDelivery = {
  channels: string[];
};

export function parseExpertDelivery(raw: unknown): ExpertDelivery {
  if (!raw || typeof raw !== "object") {
    return { channels: [...DEFAULT_EXPERT_DELIVERY.channels] };
  }
  const channels = (raw as { channels?: unknown }).channels;
  if (!Array.isArray(channels)) {
    return { channels: [...DEFAULT_EXPERT_DELIVERY.channels] };
  }
  const cleaned = channels
    .filter((c): c is string => typeof c === "string" && Boolean(c.trim()))
    .map((c) => c.trim());
  return {
    channels: cleaned.length
      ? cleaned
      : [...DEFAULT_EXPERT_DELIVERY.channels],
  };
}

export function resolveExpertModelId(stored?: string | null): string {
  const id = stored?.trim();
  return id || EXPERT_MODEL_ID;
}
