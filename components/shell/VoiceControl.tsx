"use client";

import { MessageSquare } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { SIDEBAR_FOOTER_ROW } from "@/components/shell/AccountMenu";
import { VoiceOrb } from "@/components/shell/VoiceOrb";
import type { VoiceAnchor } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Sidebar footer row — orb icon + “Voice”, above General. */
export function VoiceControl({ className }: { className?: string }) {
  const {
    voiceActive,
    voiceSpeaking,
    voiceThreadId,
    toggleVoice,
    openVoiceThread,
    entitlements,
  } = useApp();

  if (!entitlements.hasVoice) return null;

  return (
    <div className={cn("flex w-full items-center gap-0.5", className)}>
      <button
        type="button"
        aria-pressed={voiceActive}
        aria-label={voiceActive ? "Stop voice" : "Start voice"}
        onClick={toggleVoice}
        className={cn(
          SIDEBAR_FOOTER_ROW,
          "min-w-0 flex-1",
          voiceActive && "bg-sidebar-accent font-medium",
        )}
      >
        <VoiceOrb
          active={voiceActive}
          speaking={voiceSpeaking}
          as="div"
          size={16}
          label={voiceActive ? "Listening" : "Voice"}
          className="shrink-0"
        />
        Voice
      </button>
      {voiceActive && voiceThreadId ? (
        <button
          type="button"
          aria-label="Open voice chat"
          title="Open voice chat"
          onClick={openVoiceThread}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-sidebar-accent hover:text-foreground"
        >
          <MessageSquare className="h-4 w-4" strokeWidth={2} />
        </button>
      ) : null}
    </div>
  );
}

function anchorClass(anchor: VoiceAnchor): string {
  switch (anchor) {
    case "top-left":
      return "left-4 top-4";
    case "top-center":
      return "left-1/2 top-4 -translate-x-1/2";
    case "top-right":
      return "right-4 top-4";
    case "center-left":
      return "left-4 top-1/2 -translate-y-1/2";
    case "center-right":
      return "right-4 top-1/2 -translate-y-1/2";
    case "bottom-left":
      return "bottom-24 left-4";
    case "bottom-center":
      return "bottom-24 left-1/2 -translate-x-1/2";
    case "bottom-right":
      return "bottom-24 right-4";
    default:
      return "bottom-24 right-4";
  }
}

/** Larger corner dock when voiceAnchor is a floating corner (not sidebar). */
export function FloatingVoiceDock() {
  const {
    entitlements,
    voiceActive,
    voiceSpeaking,
    voiceAnchor,
    toggleVoice,
  } = useApp();

  if (
    !entitlements.hasVoice ||
    voiceAnchor === "header" ||
    voiceAnchor === "sidebar"
  ) {
    return null;
  }

  return (
    <div
      className={cn(
        "pointer-events-none fixed z-[60]",
        anchorClass(voiceAnchor),
      )}
    >
      <div className="pointer-events-auto">
        <VoiceOrb
          active={voiceActive}
          speaking={voiceSpeaking}
          size={64}
          onClick={toggleVoice}
          label={voiceActive ? "Stop voice" : "Start voice"}
          className="shadow-lg"
        />
      </div>
    </div>
  );
}
