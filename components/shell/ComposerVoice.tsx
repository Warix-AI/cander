"use client";

import type { ReactNode } from "react";
import { ArrowUp, Mic, Square, X } from "lucide-react";
import { VoiceDictationWaveform } from "@/components/shell/VoiceDictationWaveform";
import type { AudioMeter } from "@/lib/voice/audio-meter";
import { cn } from "@/lib/utils";

/**
 * Match normal composer control size so the recording row stays
 * the same height as the static text field (no expansion).
 */
const REC_BTN = 28;

/**
 * Recording composer row — same height as the idle composer line:
 * [ X ]  [ rolling waveform / Transcribing… ]  [ ■ ] [ ↑ ]
 */
export function ComposerRecordingView({
  onCancel,
  onStop,
  onSend,
  compact = false,
  status = "recording",
  meter = null,
}: {
  onCancel: () => void;
  onStop: () => void;
  /** Send while recording → stop + transcribe + send */
  onSend: () => void;
  compact?: boolean;
  status?: "recording" | "transcribing";
  meter?: AudioMeter | null;
}) {
  // Match textarea line height (h-8 / compact h-7), not a taller control row.
  const waveH = compact ? 22 : 24;
  const isTranscribing = status === "transcribing";

  return (
    <div
      className={cn(
        "flex w-full items-center gap-1",
        compact ? "h-7" : "h-8",
      )}
      role="status"
      aria-live="polite"
      aria-label={isTranscribing ? "Transcribing" : "Recording"}
    >
      <CircleIconBtn
        label="Cancel recording"
        onClick={onCancel}
        size={REC_BTN}
        className="bg-muted text-foreground hover:bg-muted/80"
        disabled={isTranscribing}
      >
        <X className="h-3.5 w-3.5" strokeWidth={2} />
      </CircleIconBtn>

      <div className="relative min-w-0 flex-1 self-stretch">
        {!isTranscribing ? (
          <div className="flex h-full items-center">
            <VoiceDictationWaveform
              meter={meter}
              active
              height={waveH}
            />
          </div>
        ) : (
          <p
            className={cn(
              "absolute inset-0 flex items-center justify-center select-none text-muted-foreground",
              compact ? "text-[12px]" : "text-[13px]",
            )}
          >
            Transcribing…
          </p>
        )}
      </div>

      {!isTranscribing ? (
        <CircleIconBtn
          label="Stop and insert transcript"
          onClick={onStop}
          size={REC_BTN}
          className="bg-muted text-foreground hover:bg-muted/80"
        >
          <Square className="h-2.5 w-2.5 fill-current" strokeWidth={0} />
        </CircleIconBtn>
      ) : null}

      <ComposerSendButton
        compact={compact}
        onClick={onSend}
        disabled={isTranscribing}
        className={isTranscribing ? "opacity-50" : undefined}
      />
    </div>
  );
}

export function ComposerSendButton({
  compact = false,
  className,
  onClick,
  disabled,
}: {
  compact?: boolean;
  className?: string;
  /** Prefer explicit click on iOS — form submit alone is unreliable with keyboard lift. */
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="submit"
      aria-label="Send"
      disabled={disabled}
      onPointerDown={(event) => {
        // Avoid stealing focus from the composer textarea (keeps keyboard open).
        event.preventDefault();
      }}
      onClick={(event) => {
        if (!onClick) return;
        event.preventDefault();
        onClick();
      }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors duration-200 hover:bg-foreground disabled:pointer-events-none disabled:opacity-40",
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
      onPointerDown={(event) => {
        // Keep the composer textarea focused so the soft keyboard stays open.
        event.preventDefault();
      }}
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

/**
 * Trailing actions for the normal (non-recording) composer.
 * Dictation only — no live / realtime voice control.
 */
export function ComposerTrailingActions({
  canSend,
  hasVoice,
  compact = false,
  onStartDictation,
  onSend,
}: {
  /** True when there is text, images, or files to send. */
  canSend: boolean;
  hasVoice: boolean;
  compact?: boolean;
  onStartDictation: () => void;
  onSend?: () => void;
}) {
  if (!hasVoice) {
    return canSend ? (
      <ComposerSendButton compact={compact} onClick={onSend} />
    ) : null;
  }

  return (
    <>
      <ComposerDictationButton onClick={onStartDictation} compact={compact} />
      <ComposerSendButton
        compact={compact}
        onClick={onSend}
        disabled={!canSend}
        className={!canSend ? "opacity-40" : undefined}
      />
    </>
  );
}

function CircleIconBtn({
  children,
  label,
  onClick,
  size,
  className,
  disabled,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  size: number;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      onPointerDown={(event) => {
        // Keep the underlying textarea focused so the keyboard stays open.
        event.preventDefault();
      }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full transition-colors duration-200",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {children}
    </button>
  );
}
