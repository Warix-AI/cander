/**
 * Apply conversational preference tool args → AssistantProfile mutations.
 */

import {
  isLiveVoiceId,
  LIVE_VOICE_OPTIONS,
  liveVoiceLabel,
  liveVoicesByPresentation,
  type LiveVoiceId,
} from "@/lib/voice/live-voices";
import {
  getAssistantProfileSnapshot,
  patchAssistantProfile,
  renameVoice,
  resetAssistantProfile,
  resolveAssistantDisplayName,
  undoAssistantProfile,
  type AssistantProfilePatch,
} from "@/lib/voice/assistant-profile";
import { persistOnDeviceIdentity } from "@/lib/ai/runtime/on-device-workspace-cache";
import { requestAssistantProfileFlush } from "@/lib/api/assistant-profile-sync";

export type AssistantProfileApplyArgs = {
  undo?: boolean;
  reset?: boolean;
  assistantName?: string | null;
  userName?: string | null;
  voiceId?: string | null;
  pace?: number;
  energy?: number;
  warmth?: number;
  expressiveness?: number;
  humor?: number;
  sarcasm?: number;
  formality?: number;
  conciseness?: number;
  directness?: number;
  backchannelLevel?: number;
  demeanor?: string | null;
  addStyleInstruction?: string;
  reason?: string;
};

function resolveVoiceRequest(
  raw: string | null | undefined,
): LiveVoiceId | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "" || raw === "default" || raw === "normal") {
    return null;
  }
  const t = raw.trim().toLowerCase();
  if (isLiveVoiceId(t)) return t;

  // Match by persona label (charlie, grace, …).
  const byLabel = LIVE_VOICE_OPTIONS.find(
    (o) => o.label.toLowerCase() === t || o.id === t,
  );
  if (byLabel) return byLabel.id;

  // Soft map natural language → catalog.
  if (/\b(australian)\b/.test(t) && /\b(female|woman|feminine)\b/.test(t)) {
    return "quartz";
  }
  if (/\b(australian)\b/.test(t)) return "ripple";
  if (/\b(irish)\b/.test(t) && /\b(female|woman|feminine)\b/.test(t)) {
    return "willow";
  }
  if (/\b(irish)\b/.test(t)) return "stone";
  if (/\b(british|uk|english accent)\b/.test(t)) return "vesper";
  if (/\b(southern|south(ern)?\s*(us|u\.s\.))\b/.test(t) && /\b(female|woman)\b/.test(t)) {
    return "delta";
  }
  if (/\b(southern|south(ern)?\s*(us|u\.s\.))\b/.test(t)) return "cinder";
  if (/\b(brazilian|portuguese|brazil)\b/.test(t) && /\b(female|woman)\b/.test(t)) {
    return "bossa";
  }
  if (/\b(brazilian|portuguese|brazil)\b/.test(t)) return "tempo";
  if (/\b(filipino|philippines)\b/.test(t)) return "beacon";
  if (/\b(female|woman|feminine|soft)\b/.test(t)) {
    const feminine = liveVoicesByPresentation("feminine");
    const current = getAssistantProfileSnapshot().voiceId;
    const idx = feminine.findIndex((v) => v.id === current);
    return feminine[(idx + 1) % feminine.length]?.id ?? "gleam";
  }
  if (/\b(male|man|masculine|deeper|deep)\b/.test(t)) {
    const masculine = liveVoicesByPresentation("masculine");
    const current = getAssistantProfileSnapshot().voiceId;
    const idx = masculine.findIndex((v) => v.id === current);
    return masculine[(idx + 1) % masculine.length]?.id ?? "marin";
  }
  if (/\b(grace|gleam)\b/.test(t)) return "gleam";
  if (/\b(henry|vesper)\b/.test(t)) return "vesper";
  if (/\b(caleb|stone)\b/.test(t)) return "stone";
  if (/\b(charlie|marin|warm|clear)\b/.test(t)) return "marin";
  if (/\b(quinn|quartz)\b/.test(t)) return "quartz";
  if (/\b(riley|ripple)\b/.test(t)) return "ripple";
  if (/\b(wren|willow)\b/.test(t)) return "willow";
  if (/\b(miles|meridian)\b/.test(t)) return "meridian";
  if (/\b(della|delta)\b/.test(t)) return "delta";
  if (/\b(cole|cinder)\b/.test(t)) return "cinder";
  if (/\b(ben|beacon)\b/.test(t)) return "beacon";
  if (/\b(beatriz|bossa)\b/.test(t)) return "bossa";
  if (/\b(thiago|tempo)\b/.test(t)) return "tempo";
  if (/\b(another|different|other|next)\b/.test(t)) {
    const current = getAssistantProfileSnapshot().voiceId ?? "marin";
    const ids = LIVE_VOICE_OPTIONS.map((o) => o.id);
    const idx = ids.indexOf(current);
    return ids[(idx + 1) % ids.length]!;
  }
  if (/\b(previous|before|back)\b/.test(t)) {
    const current = getAssistantProfileSnapshot().voiceId ?? "marin";
    const ids = LIVE_VOICE_OPTIONS.map((o) => o.id);
    const idx = ids.indexOf(current);
    return ids[(idx - 1 + ids.length) % ids.length]!;
  }
  return undefined;
}

/** Execute assistant.profile.apply — single path for chat, voice, and Settings phrases. */
export function applyAssistantProfileToolArgs(
  args: AssistantProfileApplyArgs,
): { ok: boolean; output: string } {
  if (args.undo) {
    const restored = undoAssistantProfile();
    if (!restored) {
      return { ok: true, output: "Nothing to undo." };
    }
    return {
      ok: true,
      output: "Reverted the last personality change.",
    };
  }
  if (args.reset) {
    resetAssistantProfile();
    return {
      ok: true,
      output: "Reset personality to the default voice and style.",
    };
  }

  const patch: AssistantProfilePatch = {};
  let renamedViaHelper = false;
  if (args.assistantName !== undefined) {
    // Per-voice rename — sticks to the active (or requested) voice id.
    const voiceForName =
      args.voiceId !== undefined
        ? resolveVoiceRequest(args.voiceId)
        : undefined;
    renameVoice(
      args.assistantName === null || args.assistantName === ""
        ? null
        : String(args.assistantName),
      voiceForName && voiceForName !== null ? voiceForName : undefined,
    );
    renamedViaHelper = true;
  }
  if (args.userName !== undefined) {
    patch.userName =
      args.userName === null || args.userName === ""
        ? null
        : String(args.userName).trim().slice(0, 48) || null;
  }
  if (args.voiceId !== undefined) {
    const resolved = resolveVoiceRequest(args.voiceId);
    if (resolved !== undefined) patch.voiceId = resolved;
  }
  const dims = [
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
  for (const key of dims) {
    if (args[key] !== undefined) patch[key] = args[key] as number;
  }
  if (args.demeanor !== undefined) {
    patch.demeanor =
      args.demeanor === null || args.demeanor === ""
        ? null
        : String(args.demeanor).trim().slice(0, 80) || null;
  }
  if (args.addStyleInstruction?.trim()) {
    const current = getAssistantProfileSnapshot();
    const next = [
      ...(current.customStyleInstructions ?? []),
      args.addStyleInstruction.trim().slice(0, 200),
    ].slice(-12);
    patch.customStyleInstructions = next;
  }

  if (Object.keys(patch).length === 0) {
    if (renamedViaHelper) {
      const next = getAssistantProfileSnapshot();
      try {
        requestAssistantProfileFlush();
      } catch {
        /* ignore */
      }
      return {
        ok: true,
        output: `Got it — I'll go by ${resolveAssistantDisplayName(next)}. That name sticks on this voice for future chats.`,
      };
    }
    return {
      ok: false,
      output: "No personality changes provided.",
    };
  }

  const next = patchAssistantProfile(patch);

  if (patch.userName?.trim()) {
    try {
      persistOnDeviceIdentity({ shortName: patch.userName.trim() });
    } catch {
      /* ignore */
    }
  }

  try {
    requestAssistantProfileFlush();
  } catch {
    /* ignore — sync is best-effort */
  }

  const bits: string[] = [];
  if (renamedViaHelper || patch.assistantName !== undefined) {
    bits.push(`I'll go by ${resolveAssistantDisplayName(next)}`);
  }
  if (patch.userName !== undefined) {
    bits.push(
      patch.userName
        ? `I'll remember your name is ${patch.userName}`
        : "I'll stop using a preferred name for you",
    );
  }
  if (patch.voiceId !== undefined) {
    bits.push(
      patch.voiceId
        ? `switched voice to ${liveVoiceLabel(patch.voiceId)}`
        : "restored the default voice selection",
    );
  }
  if (patch.humor !== undefined) bits.push("updated humor");
  if (patch.sarcasm !== undefined) bits.push("updated sarcasm");
  if (patch.pace !== undefined) bits.push("updated speaking pace");
  if (patch.energy !== undefined) bits.push("updated energy");
  if (patch.warmth !== undefined || patch.formality !== undefined) {
    bits.push("updated tone");
  }
  if (patch.conciseness !== undefined) bits.push("updated response length");
  if (patch.expressiveness !== undefined) bits.push("updated expressiveness");
  const reason = args.reason?.trim();
  return {
    ok: true,
    output: [
      bits.length ? `Got it — ${bits.join("; ")}.` : "Personality updated.",
      reason ? `(${reason})` : "",
      "These preferences stick for future chats and voice sessions until you change them.",
      patch.voiceId
        ? `(Still going by ${next.assistantName?.trim() || liveVoiceLabel(patch.voiceId)}.)`
        : "",
    ]
      .filter(Boolean)
      .join(" "),
  };
}
