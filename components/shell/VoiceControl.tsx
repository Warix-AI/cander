"use client";

import { useState } from "react";
import { MessageSquare, X } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { SIDEBAR_FOOTER_ROW } from "@/components/shell/AccountMenu";
import { VoiceOrb } from "@/components/shell/VoiceOrb";
import type { VoiceAnchor } from "@/lib/types";
import { voiceStatusLabel } from "@/lib/voice/voice-status";
import { cn } from "@/lib/utils";

/** Sidebar footer row — matches General icon size/alignment (16px). */
export function VoiceControl({ className }: { className?: string }) {
  const {
    voiceActive,
    voiceConnecting,
    voiceStatus,
    voiceSpeaking,
    voiceThreadId,
    toggleVoice,
    openVoiceThread,
    entitlements,
  } = useApp();
  const [hovered, setHovered] = useState(false);

  if (!entitlements.hasVoice) return null;

  const live = voiceActive || voiceConnecting;
  const label = voiceStatusLabel(
    voiceConnecting && voiceStatus === "idle" ? "connecting" : voiceStatus,
  );
  const showActions = hovered && live;

  return (
    <div
      className={cn(
        "group flex w-full items-center gap-0.5 rounded-lg transition-colors duration-200",
        !live && "hover:bg-sidebar-accent",
        live && "bg-sidebar-accent",
        className,
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        aria-pressed={live}
        aria-busy={voiceConnecting}
        aria-label={
          voiceConnecting
            ? "Connecting voice"
            : voiceActive
              ? "Voice session active"
              : "Start voice"
        }
        onClick={() => {
          if (live) return;
          toggleVoice();
        }}
        className={cn(
          SIDEBAR_FOOTER_ROW,
          "min-w-0 flex-1 hover:bg-transparent",
          live && "font-medium",
        )}
      >
        <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center">
          <VoiceOrb
            active={live}
            speaking={voiceSpeaking}
            as="div"
            size={16}
            label={label}
            className="shrink-0"
          />
        </span>
        <span className="min-w-0 truncate">{label}</span>
      </button>
      {showActions ? (
        <div className="mr-0.5 flex shrink-0 items-center gap-0.5">
          {voiceThreadId ? (
            <button
              type="button"
              aria-label="Open voice chat"
              title="Open voice chat"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                openVoiceThread();
              }}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.08]"
            >
              <MessageSquare className="h-4 w-4" strokeWidth={2} />
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Stop voice"
            title="Stop voice"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              toggleVoice();
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.08]"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
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
