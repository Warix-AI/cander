/**
 * GPT-Live voice options + local preference storage.
 * API ids stay OpenAI voice names; labels are Candor personas.
 * AssistantProfile.voiceId stays in sync via assistant-profile writers.
 */

export type LiveVoiceId =
  | "marin"
  | "gleam"
  | "vesper"
  | "stone"
  | "quartz"
  | "ripple"
  | "willow"
  | "meridian"
  | "bossa"
  | "tempo"
  | "beacon"
  | "delta"
  | "cinder";

export type LiveVoiceOption = {
  id: LiveVoiceId;
  /** Display / spoken persona name (default when user has not set assistantName). */
  label: string;
  detail: string;
  presentation: "feminine" | "masculine";
};

/**
 * Full GPT-Live-1 catalog (OpenAI docs).
 * Default spoken names are Candor personas; users can override via assistantName.
 */
export const LIVE_VOICE_OPTIONS: LiveVoiceOption[] = [
  {
    id: "marin",
    label: "Charlie",
    detail: "Default · warm, clear",
    presentation: "masculine",
  },
  {
    id: "gleam",
    label: "Grace",
    detail: "North American · feminine",
    presentation: "feminine",
  },
  {
    id: "meridian",
    label: "Miles",
    detail: "North American · masculine",
    presentation: "masculine",
  },
  {
    id: "vesper",
    label: "Henry",
    detail: "British · masculine",
    presentation: "masculine",
  },
  {
    id: "willow",
    label: "Wren",
    detail: "Irish · feminine",
    presentation: "feminine",
  },
  {
    id: "stone",
    label: "Caleb",
    detail: "Irish · masculine",
    presentation: "masculine",
  },
  {
    id: "quartz",
    label: "Quinn",
    detail: "Australian · feminine",
    presentation: "feminine",
  },
  {
    id: "ripple",
    label: "Riley",
    detail: "Australian · masculine",
    presentation: "masculine",
  },
  {
    id: "delta",
    label: "Della",
    detail: "Southern U.S. · feminine",
    presentation: "feminine",
  },
  {
    id: "cinder",
    label: "Cole",
    detail: "Southern U.S. · masculine",
    presentation: "masculine",
  },
  {
    id: "beacon",
    label: "Ben",
    detail: "Filipino · masculine",
    presentation: "masculine",
  },
  {
    id: "bossa",
    label: "Beatriz",
    detail: "Brazilian Portuguese · feminine",
    presentation: "feminine",
  },
  {
    id: "tempo",
    label: "Thiago",
    detail: "Brazilian Portuguese · masculine",
    presentation: "masculine",
  },
];

export const DEFAULT_LIVE_VOICE: LiveVoiceId = "marin";

const STORAGE_KEY = "cander:live-voice";
const PROFILE_STORAGE_KEY = "cander:assistant-profile:v1";

export function isLiveVoiceId(value: unknown): value is LiveVoiceId {
  return (
    typeof value === "string" &&
    LIVE_VOICE_OPTIONS.some((option) => option.id === value)
  );
}

export function readLiveVoicePreference(): LiveVoiceId {
  if (typeof window === "undefined") return DEFAULT_LIVE_VOICE;
  try {
    const profileRaw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (profileRaw) {
      const parsed = JSON.parse(profileRaw) as { voiceId?: unknown };
      if (isLiveVoiceId(parsed.voiceId)) return parsed.voiceId;
    }
  } catch {
    /* ignore */
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (isLiveVoiceId(raw)) return raw;
  } catch {
    /* ignore */
  }
  return DEFAULT_LIVE_VOICE;
}

export function writeLiveVoicePreference(voice: LiveVoiceId) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, voice);
  } catch {
    /* ignore */
  }
  // Keep AssistantProfile.voiceId aligned without importing the profile module
  // (avoids a circular dependency with assistant-profile → live-voices).
  try {
    const profileRaw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    const base = profileRaw
      ? (JSON.parse(profileRaw) as Record<string, unknown>)
      : {};
    window.localStorage.setItem(
      PROFILE_STORAGE_KEY,
      JSON.stringify({ ...base, voiceId: voice }),
    );
  } catch {
    /* ignore */
  }
  window.dispatchEvent(
    new CustomEvent("cander:live-voice", { detail: { voice } }),
  );
  window.dispatchEvent(new CustomEvent("cander:assistant-profile"));
}

export function liveVoiceLabel(id: LiveVoiceId): string {
  return LIVE_VOICE_OPTIONS.find((option) => option.id === id)?.label ?? id;
}

/** Persona name the Live model should claim as its own (when assistantName unset). */
export function liveVoicePersonaName(id: LiveVoiceId): string {
  return liveVoiceLabel(id);
}

export function liveVoicesByPresentation(
  presentation: "feminine" | "masculine",
): LiveVoiceOption[] {
  return LIVE_VOICE_OPTIONS.filter((v) => v.presentation === presentation);
}
