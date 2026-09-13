"use client";

import { useEffect, useRef } from "react";
import { SHELL_G3_RADIUS } from "@/lib/shell-chrome";
import { cn } from "@/lib/utils";

/** Matches hosted Supabase Auth → Email → OTP length (6–10). */
export const SIGNUP_OTP_LENGTH = 8;

export function VerifyCodeInput({
  value,
  onChange,
  onComplete,
  disabled,
  autoFocus,
  length = SIGNUP_OTP_LENGTH,
}: {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  length?: number;
}) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const autofillRef = useRef<HTMLInputElement>(null);
  const digits = Array.from({ length }, (_, index) => value[index] ?? "");

  const commit = (next: string) => {
    const cleaned = next.replace(/\D/g, "").slice(0, length);
    onChange(cleaned);
    if (cleaned.length === length) {
      onComplete?.(cleaned);
    }
    return cleaned;
  };

  const focusAt = (index: number) => {
    const clamped = Math.max(0, Math.min(length - 1, index));
    inputRefs.current[clamped]?.focus();
    inputRefs.current[clamped]?.select();
  };

  const setDigitAt = (index: number, digit: string) => {
    const cleaned = digit.replace(/\D/g, "");

    if (cleaned.length > 1) {
      const next = (value.slice(0, index) + cleaned + value.slice(index)).slice(
        0,
        length,
      );
      const committed = commit(next);
      focusAt(Math.min(index + cleaned.length, length - 1));
      if (committed.length < length) {
        focusAt(committed.length);
      }
      return;
    }

    if (!cleaned) {
      commit(value.slice(0, index) + value.slice(index + 1));
      return;
    }

    const next = (value.slice(0, index) + cleaned + value.slice(index + 1)).slice(
      0,
      length,
    );
    commit(next);
    if (index < length - 1) {
      focusAt(index + 1);
    }
  };

  useEffect(() => {
    if (!autoFocus || disabled) return;
    const firstEmpty = digits.findIndex((digit) => !digit);
    focusAt(firstEmpty === -1 ? length - 1 : firstEmpty);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- focus once on mount
  }, [autoFocus, disabled, length]);

  return (
    <div className="relative">
      <input
        ref={autofillRef}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        disabled={disabled}
        value={value}
        onChange={(event) => {
          const cleaned = commit(event.target.value);
          focusAt(Math.min(cleaned.length, length - 1));
        }}
        className="pointer-events-none absolute h-0 w-0 opacity-0"
        tabIndex={-1}
        aria-hidden
      />
      <div
        className="flex gap-1.5 sm:gap-2"
        onPaste={(event) => {
          event.preventDefault();
          const pasted = event.clipboardData.getData("text");
          const cleaned = commit(pasted);
          focusAt(Math.min(cleaned.length, length - 1));
        }}
      >
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(element) => {
              inputRefs.current[index] = element;
            }}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={1}
            disabled={disabled}
            value={digit}
            aria-label={`Digit ${index + 1} of ${length}`}
            autoComplete={index === 0 ? "one-time-code" : "off"}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => setDigitAt(index, event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Backspace") {
                event.preventDefault();
                if (digit) {
                  setDigitAt(index, "");
                  return;
                }
                if (index > 0) {
                  setDigitAt(index - 1, "");
                  focusAt(index - 1);
                }
                return;
              }
              if (event.key === "ArrowLeft" && index > 0) {
                event.preventDefault();
                focusAt(index - 1);
                return;
              }
              if (event.key === "ArrowRight" && index < length - 1) {
                event.preventDefault();
                focusAt(index + 1);
              }
            }}
            className={cn(
              "onboarding-input h-11 min-w-0 flex-1 border border-foreground/12 bg-transparent text-center text-[1.05rem] font-medium tabular-nums text-foreground outline-none focus:border-foreground/12 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 disabled:opacity-50 sm:h-12 sm:text-[1.25rem]",
              SHELL_G3_RADIUS,
            )}
          />
        ))}
      </div>
    </div>
  );
}
