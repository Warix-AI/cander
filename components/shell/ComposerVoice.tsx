"use client";

import type { ReactNode } from "react";
import { ArrowUp, Mic, Square, X } from "lucide-react";
import { VoiceDictationWaveform } from "@/components/shell/VoiceDictationWaveform";
import type { AudioMeter } from "@/lib/voice/audio-meter";
import { cn } from "@/lib/utils";

/** Visual diameter for cancel/stop while recording (~ChatGPT scale). */
const REC_BTN = 34;
const REC_HIT = 44;

/**
 * Recording composer row:
 * [ X ]  [ rolling waveform ........ ]  [ ■ ] [ ↑ ]
 * Recording state is obvious from controls + waveform (no status label).
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
  const waveH = compact ? 32 : 36;
  const isTranscribing = status === "transcribing";

  return (
    <div
      className={cn(
        "flex items-center gap-1.5",
        compact ? "min-h-9 py-0.5" : "min-h-10 py-0.5",
      )}
      role="status"
      aria-live="polite"
      aria-label={isTranscribing ? "Transcribing" : "Recording"}
    >
      <CircleIconBtn
        label="Cancel recording"
        onClick={onCancel}
        size={REC_BTN}
        hitSize={REC_HIT}
        className="bg-muted text-foreground hover:bg-muted/80"
        disabled={isTranscribing}
      >
        <X className="h-3.5 w-3.5" strokeWidth={2} />
      </CircleIconBtn>

      <div className="relative min-w-0 flex-1">
        <div
          className={cn(
            "transition-opacity duration-150",
            isTranscribing ? "opacity-0" : "opacity-100",
          )}
        >
          <VoiceDictationWaveform
            meter={meter}
            active={!isTranscribing}
            height={waveH}
          />
        </div>
        {isTranscribing ? (
          <p
            className={cn(
              "absolute inset-0 flex items-center justify-center select-none text-muted-foreground",
              compact ? "text-[12px]" : "text-[13px]",
            )}
          >
            Transcribing…
          </p>
        ) : null}
      </div>

      <CircleIconBtn
        label={isTranscribing ? "Transcribing" : "Stop and insert transcript"}
        onClick={onStop}
        size={REC_BTN}
        hitSize={REC_HIT}
        className="bg-muted text-foreground hover:bg-muted/80"
        disabled={isTranscribing}
      >
        <Square className="h-2.5 w-2.5 fill-current" strokeWidth={0} />
      </CircleIconBtn>

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
  hitSize,
  className,
  disabled,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  size: number;
  /** Invisible touch target (can exceed visual size on mobile). */
  hitSize?: number;
  className?: string;
  disabled?: boolean;
}) {
  const hit = hitSize ?? size;
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full transition-colors duration-200",
        disabled && "pointer-events-none opacity-50",
      )}
      style={{ width: hit, height: hit }}
    >
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-full",
          className,
        )}
        style={{ width: size, height: size }}
      >
        {children}
      </span>
    </button>
  );
}
