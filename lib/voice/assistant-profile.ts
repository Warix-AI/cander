/**
 * Persisted conversational assistant personality / voice preferences.
 * Source of truth for GPT-Live instructions and Settings discovery cards.
 */

import {
  DEFAULT_LIVE_VOICE,
  isLiveVoiceId,
  liveVoiceLabel,
  type LiveVoiceId,
} from "./live-voices.ts";

export type AssistantProfile = {
  /** Spoken persona name (legacy global; prefer voiceNames[voiceId]). */
  assistantName: string | null;
  /** Per-voice display names — each Live voice can be renamed independently. */
  voiceNames: Partial<Record<LiveVoiceId, string>>;
  /** How the assistant should address the user across chats. */
  userName: string | null;
  voiceId: LiveVoiceId | null;
  pace: number;
  energy: number;
  warmth: number;
  expressiveness: number;
  humor: number;
  sarcasm: number;
  formality: number;
  conciseness: number;
  directness: number;
  backchannelLevel: number;
  demeanor?: string | null;
  customStyleInstructions?: string[];
};

export type AssistantProfilePatch = Partial<{
  assistantName: string | null;
  voiceNames: Partial<Record<LiveVoiceId, string>>;
  userName: string | null;
  voiceId: LiveVoiceId | null;
  pace: number;
  energy: number;
  warmth: number;
  expressiveness: number;
  humor: number;
  sarcasm: number;
  formality: number;
  conciseness: number;
  directness: number;
  backchannelLevel: number;
  demeanor: string | null;
  customStyleInstructions: string[];
}>;

export const DEFAULT_ASSISTANT_PROFILE: AssistantProfile = {
  assistantName: null,
  voiceNames: {},
  userName: null,
  voiceId: DEFAULT_LIVE_VOICE,
  pace: 5,
  energy: 5,
  warmth: 6,
  expressiveness: 5,
  humor: 4,
  sarcasm: 2,
  formality: 4,
  conciseness: 6,
  directness: 5,
  backchannelLevel: 4,
  demeanor: null,
  customStyleInstructions: [],
};

const STORAGE_KEY = "cander:assistant-profile:v1";
const LEGACY_VOICE_KEY = "cander:live-voice";
const EVENT_NAME = "cander:assistant-profile";
const MAX_UNDO = 8;

type Listener = () => void;

let cached: AssistantProfile | null = null;
let undoStack: AssistantProfile[] = [];
const listeners = new Set<Listener>();

/** Personality dimensions use a 1–10 integer scale. */
function clampDim(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(10, Math.round(n)));
}

export const ASSISTANT_PROFILE_DIM_KEYS = [
  "pace",
  "energy",
  "warmth",
  "expressiveness",
  "humor",
  "sarcasm",
  "formality",
  "conciseness",
  "directness",
  "backchannelLevel",
] as const;

export type AssistantProfileDimKey = (typeof ASSISTANT_PROFILE_DIM_KEYS)[number];

export const ASSISTANT_PROFILE_DIM_LABELS: Record<AssistantProfileDimKey, string> = {
  pace: "pace",
  energy: "energy",
  warmth: "warmth",
  expressiveness: "expressiveness",
  humor: "humor",
  sarcasm: "sarcasm",
  formality: "formality",
  conciseness: "response length",
  directness: "directness",
  backchannelLevel: "backchannel",
};


function clampName(value: unknown, fallback: string | null): string | null {
  if (value === null) return null;
  if (typeof value === "string") {
    return value.trim().slice(0, 48) || null;
  }
  return fallback;
}

function emit() {
  listeners.forEach((l) => l());
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(EVENT_NAME, {
        detail: { profile: getAssistantProfileSnapshot() },
      }),
    );
  }
}

export function clampAssistantProfile(
  raw: Partial<AssistantProfile> | null | undefined,
): AssistantProfile {
  const base = DEFAULT_ASSISTANT_PROFILE;
  const voiceRaw = raw?.voiceId;
  const voiceId =
    voiceRaw === null
      ? null
      : isLiveVoiceId(voiceRaw)
        ? voiceRaw
        : base.voiceId;
  const custom = Array.isArray(raw?.customStyleInstructions)
    ? raw!.customStyleInstructions!
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 12)
    : base.customStyleInstructions ?? [];

  const voiceNames: Partial<Record<LiveVoiceId, string>> = {};
  const rawNames =
    raw?.voiceNames && typeof raw.voiceNames === "object"
      ? raw.voiceNames
      : base.voiceNames;
  for (const [key, value] of Object.entries(rawNames ?? {})) {
    if (!isLiveVoiceId(key)) continue;
    const name = typeof value === "string" ? value.trim().slice(0, 48) : "";
    if (name) voiceNames[key] = name;
  }
  // Migrate legacy global assistantName only when no per-voice names exist yet.
  const assistantName = clampName(raw?.assistantName, base.assistantName);
  if (
    assistantName &&
    voiceId &&
    isLiveVoiceId(voiceId) &&
    Object.keys(voiceNames).length === 0
  ) {
    voiceNames[voiceId] = assistantName;
  }

  return {
    assistantName,
    voiceNames,
    userName: clampName(raw?.userName, base.userName),
    voiceId,
    pace: clampDim(raw?.pace, base.pace),
    energy: clampDim(raw?.energy, base.energy),
    warmth: clampDim(raw?.warmth, base.warmth),
    expressiveness: clampDim(raw?.expressiveness, base.expressiveness),
    humor: clampDim(raw?.humor, base.humor),
    sarcasm: clampDim(raw?.sarcasm, base.sarcasm),
    formality: clampDim(raw?.formality, base.formality),
    conciseness: clampDim(raw?.conciseness, base.conciseness),
    directness: clampDim(raw?.directness, base.directness),
    backchannelLevel: clampDim(raw?.backchannelLevel, base.backchannelLevel),
    demeanor:
      typeof raw?.demeanor === "string"
        ? raw.demeanor.trim().slice(0, 80) || null
        : raw?.demeanor === null
          ? null
          : (base.demeanor ?? null),
    customStyleInstructions: custom,
  };
}

/**
 * Prefer remote dims/voice, but never wipe a known local identity with null.
 * Fixes bootstrap races where an older remote row overwrote a fresh local name.
 */
export function mergeAssistantProfiles(
  remote: AssistantProfile,
  local: AssistantProfile,
): AssistantProfile {
  return clampAssistantProfile({
    ...remote,
    assistantName: remote.assistantName ?? local.assistantName,
    userName: remote.userName ?? local.userName,
    voiceId: remote.voiceId ?? local.voiceId,
    voiceNames: { ...local.voiceNames, ...remote.voiceNames },
    customStyleInstructions:
      remote.customStyleInstructions?.length
        ? remote.customStyleInstructions
        : local.customStyleInstructions,
    demeanor: remote.demeanor ?? local.demeanor,
  });
}

function profilesEqual(a: AssistantProfile, b: AssistantProfile): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function persist(profile: AssistantProfile) {
  cached = profile;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    if (profile.voiceId && isLiveVoiceId(profile.voiceId)) {
      window.localStorage.setItem(LEGACY_VOICE_KEY, profile.voiceId);
    }
  } catch {
    /* ignore */
  }
}

function loadFromStorage(): AssistantProfile {
  if (typeof window === "undefined") return { ...DEFAULT_ASSISTANT_PROFILE };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AssistantProfile>;
      return clampAssistantProfile(parsed);
    }
  } catch {
    /* ignore */
  }
  try {
    const legacy = window.localStorage.getItem(LEGACY_VOICE_KEY);
    if (isLiveVoiceId(legacy)) {
      return clampAssistantProfile({
        ...DEFAULT_ASSISTANT_PROFILE,
        voiceId: legacy,
      });
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_ASSISTANT_PROFILE };
}

export function getAssistantProfileSnapshot(): AssistantProfile {
  if (!cached) cached = loadFromStorage();
  return cached;
}

export function readAssistantProfile(): AssistantProfile {
  return getAssistantProfileSnapshot();
}

export function replaceAssistantProfile(
  next: AssistantProfile,
  opts?: { pushUndo?: boolean; silent?: boolean },
) {
  const clamped = clampAssistantProfile(next);
  const prev = getAssistantProfileSnapshot();
  if (profilesEqual(prev, clamped)) return clamped;
  if (opts?.pushUndo !== false) {
    undoStack = [...undoStack.slice(-(MAX_UNDO - 1)), prev];
  }
  persist(clamped);
  if (clamped.voiceId && isLiveVoiceId(clamped.voiceId)) {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LEGACY_VOICE_KEY, clamped.voiceId);
        window.dispatchEvent(
          new CustomEvent("cander:live-voice", {
            detail: { voice: clamped.voiceId },
          }),
        );
      }
    } catch {
      /* ignore */
    }
  }
  if (!opts?.silent) emit();
  return clamped;
}

export function writeAssistantProfile(next: AssistantProfile) {
  return replaceAssistantProfile(next);
}

export function patchAssistantProfile(
  patch: AssistantProfilePatch,
): AssistantProfile {
  const current = getAssistantProfileSnapshot();
  return replaceAssistantProfile({ ...current, ...patch });
}

export function undoAssistantProfile(): AssistantProfile | null {
  const prev = undoStack.pop();
  if (!prev) return null;
  persist(clampAssistantProfile(prev));
  emit();
  return getAssistantProfileSnapshot();
}

export function resetAssistantProfile(): AssistantProfile {
  return replaceAssistantProfile({ ...DEFAULT_ASSISTANT_PROFILE });
}

export function subscribeAssistantProfile(listener: Listener) {
  listeners.add(listener);
  if (typeof window !== "undefined") {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY || e.key === LEGACY_VOICE_KEY) {
        cached = loadFromStorage();
        listener();
      }
    };
    // live-voices writes localStorage then fires this event — reload so cache stays fresh.
    const onCustom = () => {
      cached = loadFromStorage();
      listener();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(EVENT_NAME, onCustom);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(EVENT_NAME, onCustom);
    };
  }
  return () => {
    listeners.delete(listener);
  };
}

/** Resolve spoken display name without renaming the Cander product. */
export function resolveAssistantDisplayName(
  profile: AssistantProfile = getAssistantProfileSnapshot(),
): string {
  const voice =
    profile.voiceId && isLiveVoiceId(profile.voiceId)
      ? profile.voiceId
      : DEFAULT_LIVE_VOICE;
  const perVoice = profile.voiceNames?.[voice]?.trim();
  if (perVoice) return perVoice;
  return liveVoiceLabel(voice);
}

/** Rename the currently selected voice (or a specific voice id). */
export function renameVoice(
  name: string | null,
  voiceId?: LiveVoiceId | null,
): AssistantProfile {
  const current = getAssistantProfileSnapshot();
  const target =
    voiceId && isLiveVoiceId(voiceId)
      ? voiceId
      : current.voiceId && isLiveVoiceId(current.voiceId)
        ? current.voiceId
        : DEFAULT_LIVE_VOICE;
  const trimmed = name?.trim().slice(0, 48) || null;
  const nextNames = { ...current.voiceNames };
  if (trimmed) nextNames[target] = trimmed;
  else delete nextNames[target];
  return replaceAssistantProfile({
    ...current,
    assistantName: trimmed,
    voiceNames: nextNames,
    voiceId: target,
  });
}


/** Numeric 1–10 ledger so the model can answer "what's your humor at?". */
export function buildAssistantSettingsLedger(
  profile: AssistantProfile = getAssistantProfileSnapshot(),
): string {
  const parts = ASSISTANT_PROFILE_DIM_KEYS.map((key) => {
    const label = ASSISTANT_PROFILE_DIM_LABELS[key];
    return `${label} ${profile[key]}`;
  });
  return `Current settings (1–10 scale): ${parts.join(", ")}.`;
}

/** Identity block for text chat + Live (names stick across conversations). */
export function buildAssistantIdentityInstructions(
  profile: AssistantProfile = getAssistantProfileSnapshot(),
): string {
  const assistant = resolveAssistantDisplayName(profile);
  const voice =
    profile.voiceId && isLiveVoiceId(profile.voiceId)
      ? profile.voiceId
      : DEFAULT_LIVE_VOICE;
  const lines = [
    `Your conversational name is ${assistant}.`,
    `Active voice id: ${voice} (catalog default label: ${liveVoiceLabel(voice)}).`,
    "Candor is the product name — do not claim your name is Candor unless asked about the product.",
    "Keep this spoken name across chats and voice sessions until the user changes it.",
    "Each voice can have its own name. When the user renames you, that name applies to the active voice.",
    buildAssistantSettingsLedger(profile),
    "When asked for a setting level (humor, pace, energy, warmth, sarcasm, formality, length, expressiveness, etc.), answer with the integer from Current settings, e.g. \"My humor setting is at 8.\"",
    "When asked to turn a setting up or down, adjust toward 1–10 via assistant.profile.apply and confirm the new number.",
  ];
  if (profile.userName?.trim()) {
    lines.push(
      `The user's preferred name is ${profile.userName.trim()}. Address them by that name when it fits naturally.`,
      "Remember their name across future conversations until they change it.",
    );
  }
  return lines.join("\n");
}

export function assistantProfileEventName() {
  return EVENT_NAME;
}

/** For tests / remote hydrate — replace without undo. */
export function hydrateAssistantProfile(next: AssistantProfile) {
  persist(clampAssistantProfile(next));
  undoStack = [];
  emit();
}

export function peekAssistantProfileUndoDepth() {
  return undoStack.length;
}
