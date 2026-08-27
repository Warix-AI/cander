"use client";

import { useState } from "react";
import {
  signInWithOAuth,
  type OAuthProvider,
} from "@/lib/supabase/auth-actions";
import { SHELL_G3_RADIUS } from "@/lib/shell-chrome";
import { cn } from "@/lib/utils";

const PROVIDERS: {
  id: OAuthProvider;
  label: string;
  Icon: () => React.ReactNode;
}[] = [
  { id: "google", label: "Continue with Google", Icon: GoogleIcon },
  { id: "apple", label: "Continue with Apple", Icon: AppleIcon },
];

export function OAuthButtons({
  disabled,
  onError,
  onSelect,
}: {
  disabled?: boolean;
  onError?: (message: string) => void;
  /** When set, opens a local flow instead of starting real OAuth. */
  onSelect?: (provider: OAuthProvider) => void;
}) {
  const [busy, setBusy] = useState<OAuthProvider | null>(null);

  const start = async (provider: OAuthProvider) => {
    if (disabled || busy) return;
    if (onSelect) {
      onSelect(provider);
      return;
    }
    setBusy(provider);
    try {
      await signInWithOAuth(provider);
    } catch (err) {
      setBusy(null);
      onError?.(
        err instanceof Error
          ? err.message
          : `Could not start ${provider} sign-in.`,
      );
    }
  };

  return (
    <div className="space-y-2">
      {PROVIDERS.map((item) => (
        <button
          key={item.id}
          type="button"
          disabled={disabled || Boolean(busy)}
          onClick={() => void start(item.id)}
          className={cn(
            "inline-flex h-11 w-full items-center justify-center gap-2.5 border border-foreground/15 text-[14px] font-medium tracking-[-0.01em] hover:bg-muted disabled:opacity-50",
            SHELL_G3_RADIUS,
          )}
        >
          <item.Icon />
          {busy === item.id ? "Redirecting…" : item.label}
        </button>
      ))}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-[18px] w-[18px] shrink-0"
    >
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-[18px] w-[18px] shrink-0 fill-foreground"
    >
      <path d="M16.365 1.43c0 1.14-.42 2.2-1.18 3.03-.8.87-2.13 1.54-3.27 1.45-.14-1.1.4-2.26 1.16-3.05.8-.84 2.2-1.46 3.29-1.43zM20.5 17.2c-.55 1.26-.82 1.82-1.53 2.94-.99 1.55-2.39 3.48-4.13 3.5-1.54.02-1.94-.99-4.03-.98-2.09.01-2.53 1-4.07.98-1.74-.02-3.07-1.76-4.06-3.31C.84 17.3-.4 12.5 1.5 9.2c.95-1.65 2.46-2.69 4.15-2.71 1.55-.03 3.01 1.04 4.03 1.04 1 .0 2.7-1.29 4.55-1.1.77.03 2.94.31 4.33 2.35-3.7 2.05-3.1 7.4.94 8.42z" />
    </svg>
  );
}
