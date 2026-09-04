"use client";

import { useEffect } from "react";
import { AppCrashScreen } from "@/components/shell/AppCrashScreen";

/**
 * Root-level recovery when the root layout itself fails.
 * Must render its own html/body — does not inherit from app/layout.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[CANDER_GLOBAL_ERROR]", {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <AppCrashScreen
          reset={reset}
          detail={error.message || error.digest || null}
        />
      </body>
    </html>
  );
}
