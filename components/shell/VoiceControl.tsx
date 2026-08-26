"use client";

import { useApp } from "@/components/app/AppProvider";
import { VoiceOrb, VoiceWaveform } from "@/components/shell/VoiceOrb";
import { cn } from "@/lib/utils";

export function VoiceControl() {
  const { voiceActive, toggleVoice, sidebarOpen, entitlements } = useApp();

  if (!sidebarOpen || !entitlements.hasVoice) return null;

  return (
    <div className="mb-1 px-1">
      <button
        type="button"
        aria-pressed={voiceActive}
        aria-label={voiceActive ? "Stop voice" : "Start voice"}
        onClick={toggleVoice}
        className={cn(
          "flex w-full items-center gap-3 rounded-[10px] px-2 py-2 text-left transition-colors duration-200",
          voiceActive ? "bg-sidebar-accent" : "hover:bg-sidebar-accent",
        )}
      >
        <VoiceOrb
          active={voiceActive}
          as="div"
          size={36}
          label={voiceActive ? "Listening" : "Voice"}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-medium tracking-[-0.01em]">
            Voice
          </span>
          <span className="block truncate text-[11px] text-muted-foreground">
            {voiceActive ? "Listening…" : "Voice"}
          </span>
        </span>
        {voiceActive ? (
          <VoiceWaveform
            bars={5}
            height={14}
            active
            className="w-8 shrink-0"
            barClassName="bg-[oklch(0.62_0.16_260)] dark:bg-[oklch(0.78_0.12_252)]"
          />
        ) : null}
      </button>
    </div>
  );
}

/** Voice orb now lives above the composer — keep export for AppShell. */
export function FloatingVoiceDock() {
  return null;
}
