"use client";

import Image from "next/image";
import { APP_NAME } from "@/lib/app-brand";

type AppCrashScreenProps = {
  reset?: () => void;
  /** Show technical detail in development only. */
  detail?: string | null;
};

function resolveDarkMode() {
  if (typeof document === "undefined") return false;
  if (document.documentElement.classList.contains("dark")) return true;
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

/**
 * Friendly recovery UI when a route error boundary catches a crash.
 * Replaces the default Next.js error chrome for users.
 * Matches the user's light/dark preference (inline styles — global-error
 * may not inherit the app theme providers).
 */
export function AppCrashScreen({ reset, detail }: AppCrashScreenProps) {
  const dark = resolveDarkMode();

  const canvas = dark
    ? "radial-gradient(120% 80% at 50% 0%, oklch(0.22 0.01 265), oklch(0.14 0.01 265) 45%, #000)"
    : "radial-gradient(120% 80% at 50% 0%, oklch(0.97 0.01 250), oklch(0.94 0.01 250) 45%, oklch(0.92 0.015 250))";
  const foreground = dark ? "oklch(0.96 0.01 265)" : "oklch(0.22 0.02 250)";
  const muted = dark ? "oklch(0.72 0.01 265)" : "oklch(0.42 0.02 250)";
  const ctaBg = dark ? "oklch(0.96 0.01 265)" : "oklch(0.22 0.02 250)";
  const ctaFg = dark ? "oklch(0.16 0.01 265)" : "oklch(0.98 0 0)";
  const detailBg = dark ? "oklch(1 0 0 / 0.06)" : "oklch(0.98 0 0 / 0.7)";
  const detailFg = dark ? "oklch(0.7 0.01 265)" : "oklch(0.45 0.02 250)";

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem 1.25rem",
        background: canvas,
        color: foreground,
        fontFamily:
          'var(--font-dm-sans), "DM Sans", ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "22rem",
          textAlign: "center",
        }}
      >
        <Image
          src="/cander-mark-color.png"
          alt={APP_NAME}
          width={40}
          height={40}
          priority
          style={{ margin: "0 auto 1.25rem", display: "block" }}
        />
        <p
          style={{
            margin: 0,
            fontSize: "1.125rem",
            fontWeight: 600,
            letterSpacing: "-0.02em",
            lineHeight: 1.35,
          }}
        >
          Sorry about that
        </p>
        <p
          style={{
            margin: "0.65rem 0 0",
            fontSize: "0.9375rem",
            lineHeight: 1.5,
            color: muted,
          }}
        >
          We’re working to fix this. This has been sent to {APP_NAME}, and we’re
          actively looking into it.
        </p>
        {reset ? (
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              border: "none",
              borderRadius: "999px",
              padding: "0.65rem 1.15rem",
              background: ctaBg,
              color: ctaFg,
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        ) : null}
        {detail && process.env.NODE_ENV !== "production" ? (
          <pre
            style={{
              marginTop: "1.25rem",
              padding: "0.75rem",
              borderRadius: "10px",
              background: detailBg,
              color: detailFg,
              fontSize: "0.7rem",
              lineHeight: 1.4,
              textAlign: "left",
              overflow: "auto",
              maxHeight: "8rem",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {detail}
          </pre>
        ) : null}
      </div>
    </div>
  );
}
