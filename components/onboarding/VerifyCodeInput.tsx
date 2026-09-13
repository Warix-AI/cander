"use client";

import { useEffect, useRef } from "react";
import { SHELL_G3_RADIUS } from "@/lib/shell-chrome";
import { cn } from "@/lib/utils";

/** Matches hosted Supabase Auth → Email → OTP length (6–10). */
export const SIGNUP_OTP_LENGTH = 6;

function digitsOnly(raw: string, length = SIGNUP_OTP_LENGTH) {
  return raw.replace(/\D/g, "").slice(0, length);
}

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
  /** Called with the full cleaned code — prefer this over reading parent state. */
  onComplete?: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  length?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const completedFor = useRef("");

  useEffect(() => {
    if (!autoFocus || disabled) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [autoFocus, disabled]);

  const commit = (raw: string) => {
    const cleaned = digitsOnly(raw, length);
    onChange(cleaned);
    if (cleaned.length === length && cleaned !== completedFor.current) {
      completedFor.current = cleaned;
      onComplete?.(cleaned);
    }
    if (cleaned.length < length) {
      completedFor.current = "";
    }
    return cleaned;
  };

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      disabled={disabled}
      value={value}
      maxLength={length}
      placeholder={"0".repeat(length)}
      aria-label={`${length}-digit verification code`}
      onChange={(event) => {
        commit(event.target.value);
      }}
      onPaste={(event) => {
        event.preventDefault();
        commit(event.clipboardData.getData("text"));
      }}
      className={cn(
        "onboarding-input h-12 w-full border border-foreground/12 bg-transparent px-4 text-center text-[1.35rem] font-medium tracking-[0.35em] tabular-nums text-foreground outline-none placeholder:tracking-[0.35em] placeholder:text-foreground/25 focus:border-foreground/12 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 disabled:opacity-50",
        SHELL_G3_RADIUS,
      )}
    />
  );
}
