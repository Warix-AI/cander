"use client";

import { VoiceWaveIcon } from "@/components/shell/VoiceOrb";
import { cn } from "@/lib/utils";

const SQUARE = "rounded-lg";

/** Voice mode — rounded square with static 3-bar waveform. */
export function VoiceWaveButton({
  onClick,
  compact = false,
  className,
  ariaLabel = "Start voice",
}: {
  onClick: () => void;
  compact?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center justify-center bg-primary text-primary-foreground transition-colors duration-200 hover:bg-foreground",
        compact ? "h-7 w-7" : "h-8 w-8",
        SQUARE,
        className,
      )}
    >
      <VoiceWaveIcon size={compact ? 12 : 13} />
    </button>
  );
}
