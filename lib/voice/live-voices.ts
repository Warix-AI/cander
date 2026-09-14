/**
 * GPT-Live voice options + local preference storage.
 */

export type LiveVoiceId =
  | "marin"
  | "quartz"
  | "ripple"
  | "vesper"
  | "willow"
  | "stone"
  | "gleam"
  | "meridian"
  | "beacon"
  | "delta"
  | "cinder";

export type LiveVoiceOption = {
  id: LiveVoiceId;
  label: string;
  detail: string;
};

/** Voices supported by GPT-Live-1 (API names). Default is marin. */
export const LIVE_VOICE_OPTIONS: LiveVoiceOption[] = [
  { id: "marin", label: "Marin", detail: "Default · clear and natural" },
  { id: "gleam", label: "Gleam", detail: "North American · feminine" },
  { id: "meridian", label: "Meridian", detail: "North American · masculine" },
  { id: "quartz", label: "Quartz", detail: "Australian · feminine" },
  { id: "ripple", label: "Ripple", detail: "Australian · masculine" },
  { id: "vesper", label: "Vesper", detail: "British · masculine" },
  { id: "willow", label: "Willow", detail: "Irish · feminine" },
  { id: "stone", label: "Stone", detail: "Irish · masculine" },
  { id: "delta", label: "Delta", detail: "Southern U.S. · feminine" },
  { id: "cinder", label: "Cinder", detail: "Southern U.S. · masculine" },
  { id: "beacon", label: "Beacon", detail: "Filipino · masculine" },
];

export const DEFAULT_LIVE_VOICE: LiveVoiceId = "marin";

const STORAGE_KEY = "cander:live-voice";

export function isLiveVoiceId(value: unknown): value is LiveVoiceId {
  return (
    typeof value === "string" &&
    LIVE_VOICE_OPTIONS.some((option) => option.id === value)
  );
}

export function readLiveVoicePreference(): LiveVoiceId {
  if (typeof window === "undefined") return DEFAULT_LIVE_VOICE;
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
  window.dispatchEvent(
    new CustomEvent("cander:live-voice", { detail: { voice } }),
  );
}

export function liveVoiceLabel(id: LiveVoiceId): string {
  return LIVE_VOICE_OPTIONS.find((option) => option.id === id)?.label ?? id;
}
