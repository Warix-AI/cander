/**
 * Conversational suggestion phrases for Voice Settings discovery cards.
 */

export type VoiceSuggestionCategoryId =
  | "humor"
  | "sarcasm"
  | "pace"
  | "energy"
  | "personality"
  | "tone"
  | "length"
  | "voice"
  | "name"
  | "expressiveness";

export type VoiceSuggestionCategory = {
  id: VoiceSuggestionCategoryId;
  title: string;
  /** Lucide icon name key used by the Settings UI. */
  icon: "Smile" | "MessageCircle" | "Gauge" | "Zap" | "Sparkles" | "Heart" | "AlignLeft" | "AudioLines" | "UserRound" | "Music2";
  examples: string[];
};

export const VOICE_SUGGESTION_CATEGORIES: VoiceSuggestionCategory[] = [
  {
    id: "humor",
    title: "Humor",
    icon: "Smile",
    examples: [
      "Be a little funnier.",
      "Turn the humor way up.",
      "You can joke around more.",
      "No jokes for now.",
      "Be funny without being sarcastic.",
      "Give yourself a dry sense of humor.",
      "Make the humor like an 8 out of 10.",
      "You're trying too hard. Tone the jokes down.",
    ],
  },
  {
    id: "sarcasm",
    title: "Sarcasm",
    icon: "MessageCircle",
    examples: [
      "Stop being sarcastic.",
      "Use a little more sarcasm.",
      "Keep the sarcasm subtle.",
      "Be funny without being sarcastic.",
      "Use dry sarcasm occasionally.",
      "No sarcasm at all.",
      "Dial the sarcasm back.",
      "A light sarcastic edge is fine.",
    ],
  },
  {
    id: "pace",
    title: "Pace",
    icon: "Gauge",
    examples: [
      "Talk a little slower.",
      "Speed it up.",
      "You're talking too fast.",
      "Slow down when you're explaining things.",
      "Talk faster when the answer is simple.",
      "Take your time.",
      "Keep the pace moving.",
      "Speak at a more relaxed pace.",
    ],
  },
  {
    id: "energy",
    title: "Energy",
    icon: "Zap",
    examples: [
      "Tone your energy down.",
      "Be more energetic.",
      "Sound more excited.",
      "You're a little too cheerful.",
      "Be more laid back.",
      "Bring the energy up.",
      "Sound calmer.",
      "Keep things low-key.",
    ],
  },
  {
    id: "personality",
    title: "Personality",
    icon: "Sparkles",
    examples: [
      "Give yourself more personality.",
      "Be more laid back.",
      "Be more playful.",
      "Act a little more serious.",
      "Be more confident.",
      "Sound less robotic.",
      "Be more conversational.",
      "Just talk to me normally.",
    ],
  },
  {
    id: "tone",
    title: "Tone",
    icon: "Heart",
    examples: [
      "Sound a little warmer.",
      "Be more direct.",
      "Sound more professional.",
      "Be more casual.",
      "Talk to me like a friend.",
      "Be less formal.",
      "Sound more serious.",
      "Be softer when you respond.",
    ],
  },
  {
    id: "length",
    title: "Response length",
    icon: "AlignLeft",
    examples: [
      "Keep your answers short.",
      "You can give me more detail.",
      "Stop over-explaining.",
      "Just give me the answer.",
      "Explain things more thoroughly.",
      "Keep voice responses really concise.",
      "Give me the quick version.",
      "Go deeper when it's complicated.",
    ],
  },
  {
    id: "voice",
    title: "Voice",
    icon: "AudioLines",
    examples: [
      "Switch to a female voice.",
      "Try a British voice.",
      "Use an Australian voice.",
      "Give me a Southern U.S. voice.",
      "Try a deeper male voice.",
      "Use Grace's voice.",
      "Switch to Henry.",
      "Try something different — next voice.",
      "Go back to the voice you had before.",
      "Use a softer feminine voice.",
    ],
  },
  {
    id: "name",
    title: "Name",
    icon: "UserRound",
    examples: [
      "Call yourself Alfred.",
      "Your name is Charlie now.",
      "Can I call you Jarvis?",
      "Go back to your normal name.",
      "From now on, introduce yourself as Max.",
      "I'm going to call you Friday.",
      "What should I call you? Pick something fun.",
      "Reset your name.",
      "My name is Matt — remember that.",
      "Call me Matthew from now on.",
    ],
  },
  {
    id: "expressiveness",
    title: "Expressiveness",
    icon: "Music2",
    examples: [
      "Be more expressive.",
      "Tone down the emotion.",
      "Sound more natural.",
      "Use more emotion when you talk.",
      "Don't sound so animated.",
      "Be less dramatic.",
      "Use more vocal variation.",
      "Keep your voice steady.",
    ],
  },
];

/** Stable example for a visit — changes between visits, not while reading. */
export function pickSuggestionExample(
  category: VoiceSuggestionCategory,
  visitSeed: number,
): string {
  const list = category.examples;
  if (!list.length) return "";
  const idx = Math.abs(visitSeed + hashString(category.id)) % list.length;
  return list[idx]!;
}

export function createVoiceSettingsVisitSeed(): number {
  if (typeof window === "undefined") return 1;
  const key = "cander:voice-settings-visit";
  try {
    const prev = Number(window.sessionStorage.getItem(key) || "0");
    const next = Number.isFinite(prev) ? prev + 1 : 1;
    window.sessionStorage.setItem(key, String(next));
    return next;
  } catch {
    return Date.now() % 10_000;
  }
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return h;
}

export function voiceSettingsGridClass(mobile: boolean): string {
  return mobile
    ? "grid grid-cols-1 gap-3"
    : "grid grid-cols-1 gap-3 sm:grid-cols-2";
}
