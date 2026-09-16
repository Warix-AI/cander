"use client";

import { useApp } from "@/components/app/AppProvider";
import { VoiceOrb } from "@/components/shell/VoiceOrb";
import { SettingsPage } from "@/components/settings/SettingsChrome";

/**
 * Dedicated voice surface — centered orb for start/stop.
 * Sidebar Voice highlights only while this view is open.
 */
export function VoiceView() {
  const {
    voiceActive,
    voiceConnecting,
    voiceSpeaking,
    toggleVoice,
  } = useApp();
  const live = voiceActive || voiceConnecting;

  return (
    <SettingsPage className="flex min-h-full flex-col">
      <div className="flex min-h-[min(28rem,70vh)] flex-1 flex-col items-center justify-center px-6 py-16">
        <VoiceOrb
          active={live}
          speaking={voiceSpeaking}
          size={72}
          onClick={() => toggleVoice()}
          label={live ? "Stop voice" : "Start voice"}
        />
        <p className="mt-5 text-[14px] tracking-[-0.01em] text-muted-foreground">
          {voiceConnecting
            ? "Connecting…"
            : voiceActive
              ? "Listening"
              : "Tap to talk"}
        </p>
      </div>
    </SettingsPage>
  );
}
