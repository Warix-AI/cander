"use client";

import { useEffect } from "react";
import { AppCrashScreen } from "@/components/shell/AppCrashScreen";

export default function AppSegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[CANDER_APP_ERROR]", {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <AppCrashScreen
      reset={reset}
      detail={error.message || error.digest || null}
    />
  );
}
