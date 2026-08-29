"use client";

import { useEffect, useState } from "react";
import {
  getAiRuntimeMode,
  setAiRuntimeMode,
  subscribeAiRuntimeMode,
} from "@/lib/ai/runtime/mode-store";
import {
  getFoundationModelsAvailability,
  resetFoundationModelsPluginCache,
} from "@/lib/ai/runtime/native/foundation-models";
import type { AiRuntimeMode } from "@/lib/ai/runtime/types";
import { persistHosting } from "@/lib/session";
import { SHELL_G3_RADIUS } from "@/lib/shell-chrome";
import { cn } from "@/lib/utils";

const MODES: {
  id: AiRuntimeMode;
  title: string;
  body: string;
}[] = [
  {
    id: "cloud",
    title: "Cloud",
    body: "Cander cloud inference. Works everywhere, including the browser.",
  },
  {
    id: "auto",
    title: "Auto",
    body: "Prefer Apple on-device Intelligence when ready; otherwise use Cloud.",
  },
  {
    id: "local",
    title: "On device",
    body: "Force Apple on-device AI. Never silently sends prompts to the cloud for inference.",
  },
];

export function syncHostingFromRuntimeMode(mode: AiRuntimeMode) {
  if (mode === "cloud") persistHosting("cloud");
  else if (mode === "local") persistHosting("on-device");
  else persistHosting("local");
}

/** Shared Cloud / Auto / On device picker for Settings and onboarding. */
export function HostingModePicker({
  className,
  onModeChange,
}: {
  className?: string;
  onModeChange?: (mode: AiRuntimeMode) => void;
}) {
  const [mode, setMode] = useState<AiRuntimeMode>("auto");
  const [status, setStatus] = useState({
    available: false,
    message: "Checking…",
    reason: "",
  });

  useEffect(() => {
    setMode(getAiRuntimeMode());
    return subscribeAiRuntimeMode(() => setMode(getAiRuntimeMode()));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      resetFoundationModelsPluginCache();
      void getFoundationModelsAvailability().then((avail) => {
        if (cancelled) return;
        setStatus({
          available: avail.available,
          message: avail.message,
          reason: avail.reason,
        });
      });
    };
    refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [mode]);

  const select = (next: AiRuntimeMode) => {
    setAiRuntimeMode(next);
    setMode(next);
    syncHostingFromRuntimeMode(next);
    onModeChange?.(next);
  };

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div
        className={cn(
          "overflow-hidden border border-border bg-card",
          SHELL_G3_RADIUS,
        )}
      >
        {MODES.map((item) => {
          const selected = mode === item.id;
          const blockedLocal = item.id === "local" && !status.available;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => select(item.id)}
              className={cn(
                "flex w-full flex-col gap-1 border-b border-border/60 px-4 py-3.5 text-left transition-colors last:border-b-0",
                selected
                  ? "bg-muted/50"
                  : "bg-transparent hover:bg-muted/30",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-[15px] font-medium tracking-[-0.01em]">
                  {item.title}
                </span>
                {selected ? (
                  <span className="rounded-full bg-foreground/8 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    Selected
                  </span>
                ) : null}
              </div>
              <span className="text-[13px] leading-snug text-muted-foreground">
                {item.body}
              </span>
              {blockedLocal ? (
                <span className="text-[12px] text-amber-600 dark:text-amber-400">
                  Not available yet — {status.message}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div
        className={cn(
          "border border-border/80 bg-muted/20 px-4 py-3.5 text-[12.5px] leading-relaxed text-muted-foreground",
          SHELL_G3_RADIUS,
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="font-medium text-foreground">
            Apple Intelligence
          </span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-medium",
              status.available
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                : "bg-muted text-muted-foreground",
            )}
          >
            {status.available ? "Ready" : "Unavailable"}
          </span>
        </div>
        <p className="mt-1.5">{status.message}</p>
        {status.reason ? (
          <p className="mt-1 font-mono text-[11px] opacity-70">{status.reason}</p>
        ) : null}
      </div>
    </div>
  );
}
