"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  AlignLeft,
  AudioLines,
  Gauge,
  Heart,
  MessageCircle,
  Music2,
  Smile,
  Sparkles,
  UserRound,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import {
  SettingsHeader,
  SettingsPage,
  SettingsPanel,
} from "@/components/settings/SettingsChrome";
import { SHELL_G3_RADIUS } from "@/lib/shell-chrome";
import { useMobileShell } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import {
  getAssistantProfileSnapshot,
  renameVoice,
  subscribeAssistantProfile,
  resolveAssistantDisplayName,
} from "@/lib/voice/assistant-profile";
import {
  LIVE_VOICE_OPTIONS,
  type LiveVoiceId,
  writeLiveVoicePreference,
} from "@/lib/voice/live-voices";
import {
  VOICE_SUGGESTION_CATEGORIES,
  createVoiceSettingsVisitSeed,
  pickSuggestionExample,
  voiceSettingsGridClass,
  type VoiceSuggestionCategory,
} from "@/lib/voice/voice-suggestion-catalog";
import { requestAssistantProfileFlush } from "@/lib/api/assistant-profile-sync";

const ICONS: Record<VoiceSuggestionCategory["icon"], LucideIcon> = {
  Smile,
  MessageCircle,
  Gauge,
  Zap,
  Sparkles,
  Heart,
  AlignLeft,
  AudioLines,
  UserRound,
  Music2,
};

function subscribeProfile(onStoreChange: () => void) {
  return subscribeAssistantProfile(onStoreChange);
}

export function VoiceSettings() {
  const mobile = useMobileShell();
  const { sendMessage } = useApp();
  const profile = useSyncExternalStore(
    subscribeProfile,
    getAssistantProfileSnapshot,
    getAssistantProfileSnapshot,
  );
  const [visitSeed, setVisitSeed] = useState(1);
  const [toast, setToast] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const selectedVoice =
    (profile.voiceId as LiveVoiceId | null) ?? ("marin" as LiveVoiceId);
  const displayName = resolveAssistantDisplayName(profile);

  useEffect(() => {
    setVisitSeed(createVoiceSettingsVisitSeed());
  }, []);

  useEffect(() => {
    setRenameDraft(displayName);
  }, [displayName, selectedVoice]);

  const cards = useMemo(
    () =>
      VOICE_SUGGESTION_CATEGORIES.map((category) => ({
        category,
        example: pickSuggestionExample(category, visitSeed),
      })),
    [visitSeed],
  );

  const sendPreferencePhrase = (phrase: string) => {
    const trimmed = phrase.trim();
    if (!trimmed) return;
    sendMessage(trimmed);
    setToast("Sent to Cander…");
    window.setTimeout(() => setToast(null), 2200);
  };

  const selectVoice = (id: LiveVoiceId) => {
    writeLiveVoicePreference(id);
    requestAssistantProfileFlush();
    const label = resolveAssistantDisplayName(getAssistantProfileSnapshot());
    setToast(`Voice set to ${label}`);
    window.setTimeout(() => setToast(null), 2200);
  };

  const saveRename = () => {
    const next = renameDraft.trim();
    if (!next) return;
    renameVoice(next, selectedVoice);
    requestAssistantProfileFlush();
    setToast(`Renamed this voice to ${next}`);
    window.setTimeout(() => setToast(null), 2200);
  };

  return (
    <SettingsPage>
      <SettingsHeader title="Voice" />
      <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-muted-foreground">
        Choose a voice, give it a name, and tune personality by talking — every
        setting is on a 1–10 scale.
      </p>
      <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-muted-foreground/90">
        Ask things like “what’s your humor setting at?” or “turn pace up.” Names
        and levels stick across chats until you change them.
      </p>

      <div className="mt-6">
        <h3 className="text-[13px] font-medium text-foreground">Voices</h3>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Pick a Live voice, then rename it for this selection only.
        </p>
        <div
          className={cn(
            "mt-3",
            mobile ? "grid grid-cols-1 gap-2" : "grid grid-cols-1 gap-2 sm:grid-cols-2",
          )}
        >
          {LIVE_VOICE_OPTIONS.map((option) => {
            const active = selectedVoice === option.id;
            const custom =
              profile.voiceNames?.[option.id]?.trim() || option.label;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => selectVoice(option.id)}
                className={cn(
                  "text-left transition-colors duration-200",
                  SHELL_G3_RADIUS,
                )}
                aria-pressed={active}
              >
                <SettingsPanel
                  padded={false}
                  className={cn(
                    "h-full p-3.5 transition-colors duration-200",
                    active
                      ? "bg-sidebar-accent"
                      : "hover:bg-black/[0.03] dark:hover:bg-white/[0.06]",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-foreground">
                        {custom}
                      </div>
                      <div className="mt-0.5 text-[12px] text-muted-foreground">
                        {option.detail}
                      </div>
                    </div>
                    <span
                      className={cn(
                        "mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border",
                        active
                          ? "border-foreground bg-foreground"
                          : "border-muted-foreground/40",
                      )}
                      aria-hidden
                    />
                  </div>
                </SettingsPanel>
              </button>
            );
          })}
        </div>

        <SettingsPanel className="mt-3 p-3.5" padded={false}>
          <label className="block text-[12px] font-medium text-foreground">
            Name for this voice
          </label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveRename();
              }}
              className={cn(
                "h-9 w-full flex-1 border border-black/10 bg-transparent px-3 text-[13px] outline-none dark:border-white/10",
                SHELL_G3_RADIUS,
              )}
              placeholder="e.g. Avery"
              maxLength={48}
              aria-label="Rename active voice"
            />
            <button
              type="button"
              onClick={saveRename}
              className={cn(
                "h-9 shrink-0 px-3 text-[13px] font-medium transition-colors",
                "bg-foreground text-background hover:opacity-90",
                SHELL_G3_RADIUS,
              )}
            >
              Save name
            </button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Active: {displayName}. Switching voices keeps each name separately.
          </p>
        </SettingsPanel>
      </div>

      <div className="mt-8">
        <h3 className="text-[13px] font-medium text-foreground">
          Try saying…
        </h3>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Cards send a phrase into chat — they never edit settings directly.
        </p>
        <div className={cn("mt-3", voiceSettingsGridClass(mobile))}>
          {cards.map(({ category, example }) => {
            const Icon = ICONS[category.icon];
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => sendPreferencePhrase(example)}
                className={cn(
                  "group text-left transition-colors duration-200",
                  SHELL_G3_RADIUS,
                )}
              >
                <SettingsPanel
                  padded={false}
                  className={cn(
                    "h-full p-3.5 transition-colors duration-200",
                    "group-hover:bg-black/[0.03] dark:group-hover:bg-white/[0.06]",
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-black/[0.04] text-foreground/80 dark:bg-white/[0.06]">
                      <Icon className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium text-foreground">
                        {category.title}
                      </div>
                      <div className="mt-1 text-[11px] uppercase tracking-[0.06em] text-muted-foreground/80">
                        Try saying…
                      </div>
                      <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
                        “{example}”
                      </p>
                    </div>
                  </div>
                </SettingsPanel>
              </button>
            );
          })}
        </div>
      </div>

      {toast ? (
        <p
          className="mt-4 text-[12px] text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          {toast}
        </p>
      ) : null}
    </SettingsPage>
  );
}
