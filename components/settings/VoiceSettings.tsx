"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  SettingsHeader,
  SettingsPage,
  SettingsPanel,
} from "@/components/settings/SettingsChrome";
import {
  LIVE_VOICE_OPTIONS,
  readLiveVoicePreference,
  writeLiveVoicePreference,
  type LiveVoiceId,
} from "@/lib/voice/live-voices";
import { SHELL_G3_RADIUS } from "@/lib/shell-chrome";
import { useMobileShell } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

function subscribeLiveVoice(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const handler = () => onStoreChange();
  window.addEventListener("cander:live-voice", handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener("cander:live-voice", handler);
    window.removeEventListener("storage", handler);
  };
}

export function VoiceSettings() {
  const mobile = useMobileShell();
  const selected = useSyncExternalStore(
    subscribeLiveVoice,
    readLiveVoicePreference,
    () => "marin" as LiveVoiceId,
  );
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!note) return;
    const id = window.setTimeout(() => setNote(null), 2400);
    return () => window.clearTimeout(id);
  }, [note]);

  return (
    <SettingsPage>
      <SettingsHeader title="Voice" />
      <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-muted-foreground">
        Choose the speaking voice for Live conversations. New sessions use this
        voice; change it here, then start Voice again to apply.
      </p>

      <div className="mt-2 lg:mt-8">
        <SettingsPanel className="p-2">
          <div className="flex flex-col gap-0.5">
            {LIVE_VOICE_OPTIONS.map((option) => {
              const active = selected === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    writeLiveVoicePreference(option.id);
                    setNote(`Voice set to ${option.label}`);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors duration-200",
                    SHELL_G3_RADIUS,
                    active
                      ? "bg-sidebar-accent"
                      : "hover:bg-black/[0.03] dark:hover:bg-white/[0.06]",
                  )}
                  aria-pressed={active}
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                      active
                        ? "border-foreground"
                        : "border-muted-foreground/40",
                    )}
                    aria-hidden
                  >
                    {active ? (
                      <span className="h-2 w-2 rounded-full bg-foreground" />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-medium tracking-[-0.01em]">
                      {option.label}
                    </span>
                    <span className="block text-[12px] text-muted-foreground">
                      {option.detail}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </SettingsPanel>
        {note ? (
          <p
            className={cn(
              "mt-3 text-[12px] text-muted-foreground",
              mobile && "px-0.5",
            )}
          >
            {note}
          </p>
        ) : null}
      </div>
    </SettingsPage>
  );
}
