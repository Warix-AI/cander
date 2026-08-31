"use client";

import type { ReactNode } from "react";
import { ArrowUp, Mic, Square, X } from "lucide-react";
import { APP_MESSAGE_PLACEHOLDER } from "@/lib/app-brand";
import { VoiceOrb, VoiceWaveform } from "@/components/shell/VoiceOrb";
import { VoiceWaveButton } from "@/components/shell/VoiceWaveButton";
import { cn } from "@/lib/utils";

/** Listening orb — sits above the composer while voice mode is on. */
export function ComposerVoiceOrb({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={cn("flex justify-center", compact ? "mb-2" : "mb-3")}
      aria-hidden
    >
      <VoiceOrb
        active
        as="div"
        size={compact ? 64 : 88}
        label="Listening"
        className="voice-orb-live shadow-[0_8px_32px_oklch(0.55_0.14_260/0.22)]"
      />
    </div>
  );
}

export function ComposerRecordingView({
  onCancel,
  onStop,
  compact = false,
}: {
  onCancel: () => void;
  onStop: () => void;
  compact?: boolean;
}) {
  const btn = compact ? 32 : 36;

  return (
    <div className={cn("flex flex-col", compact ? "gap-2 py-0.5" : "gap-3 py-1")}>
      <p
        className={cn(
          "select-none text-muted-foreground",
          compact ? "px-0.5 text-[13px]" : "px-1 text-[14px]",
        )}
      >
        {APP_MESSAGE_PLACEHOLDER}
      </p>
      <div className="flex items-center gap-2">
        <CircleIconBtn
          label="Cancel recording"
          onClick={onCancel}
          size={btn}
          className="bg-muted text-foreground hover:bg-muted/80"
        >
          <X className="h-4 w-4" strokeWidth={2} />
        </CircleIconBtn>
        <VoiceWaveform
          bars={compact ? 28 : 36}
          height={compact ? 20 : 24}
          active
          className="min-w-0 flex-1"
          barClassName="bg-muted-foreground/45"
        />
        <CircleIconBtn
          label="Stop recording"
          onClick={onStop}
          size={btn}
          className="bg-muted text-foreground hover:bg-muted/80"
        >
          <Square className="h-3 w-3 fill-current" strokeWidth={0} />
        </CircleIconBtn>
        <button
          type="submit"
          aria-label="Send"
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors duration-200 hover:bg-foreground",
            compact ? "h-8 w-8" : "h-9 w-9",
          )}
        >
          <ArrowUp className="h-4 w-4" strokeWidth={2.25} />
        </button>
      </div>
    </div>
  );
}

export function ComposerSendButton({
  compact = false,
  className,
  onClick,
}: {
  compact?: boolean;
  className?: string;
  /** Prefer explicit click on iOS — form submit alone is unreliable with keyboard lift. */
  onClick?: () => void;
}) {
  return (
    <button
      type="submit"
      aria-label="Send"
      onClick={(event) => {
        if (!onClick) return;
        event.preventDefault();
        onClick();
      }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors duration-200 hover:bg-foreground",
        compact ? "h-7 w-7" : "h-8 w-8",
        className,
      )}
    >
      <ArrowUp
        className={compact ? "h-3.5 w-3.5" : "h-3.5 w-3.5"}
        strokeWidth={2.25}
      />
    </button>
  );
}

export function ComposerDictationButton({
  onClick,
  compact = false,
  className,
}: {
  onClick: () => void;
  compact?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label="Start dictation"
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center justify-center text-muted-foreground transition-colors duration-200 hover:text-foreground",
        compact ? "h-7 w-7" : "h-8 w-8",
        className,
      )}
    >
      <Mic className={compact ? "h-4 w-4" : "h-[18px] w-[18px]"} strokeWidth={1.75} />
    </button>
  );
}

function ComposerStopVoiceButton({
  onClick,
  compact = false,
}: {
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label="Stop voice"
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground",
        compact ? "h-7 w-7" : "h-8 w-8",
      )}
    >
      <X className={compact ? "h-4 w-4" : "h-[18px] w-[18px]"} strokeWidth={1.75} />
    </button>
  );
}

export function ComposerTrailingActions({
  canSend,
  hasVoice,
  voiceActive = false,
  compact = false,
  onStartVoice,
  onStopVoice,
  onStartDictation,
  onSend,
}: {
  /** True when there is text, images, or files to send. */
  canSend: boolean;
  hasVoice: boolean;
  voiceActive?: boolean;
  compact?: boolean;
  onStartVoice: () => void;
  onStopVoice: () => void;
  onStartDictation: () => void;
  onSend?: () => void;
}) {
  if (!hasVoice) {
    return canSend ? (
      <ComposerSendButton compact={compact} onClick={onSend} />
    ) : null;
  }

  if (canSend) {
    return (
      <>
        {voiceActive ? (
          <ComposerStopVoiceButton onClick={onStopVoice} compact={compact} />
        ) : (
          <ComposerDictationButton onClick={onStartDictation} compact={compact} />
        )}
        <ComposerSendButton compact={compact} onClick={onSend} />
      </>
    );
  }

  if (voiceActive) {
    return (
      <>
        <ComposerDictationButton onClick={onStartDictation} compact={compact} />
        <ComposerStopVoiceButton onClick={onStopVoice} compact={compact} />
      </>
    );
  }

  return (
    <>
      <ComposerDictationButton onClick={onStartDictation} compact={compact} />
      <VoiceWaveButton onClick={onStartVoice} compact={compact} ariaLabel="Start voice" />
    </>
  );
}

function CircleIconBtn({
  children,
  label,
  onClick,
  size,
  className,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  size: number;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full transition-colors duration-200",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {children}
    </button>
  );
}
