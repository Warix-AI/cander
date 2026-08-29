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
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="overflow-hidden rounded-[12px] border border-border">
        {MODES.map((item) => {
          const selected = mode === item.id;
          const blockedLocal = item.id === "local" && !status.available;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => select(item.id)}
              className={cn(
                "flex w-full flex-col gap-1 border-b border-border/60 px-4 py-3.5 text-left last:border-b-0",
                selected ? "bg-muted/40" : "hover:bg-muted/30",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-[15px] font-medium">{item.title}</span>
                {selected ? (
                  <span className="text-[12px] text-muted-foreground">
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

      <div className="rounded-[12px] border border-border/70 px-4 py-3 text-[12.5px] leading-relaxed text-muted-foreground">
        <div className="font-medium text-foreground">
          Apple Intelligence: {status.available ? "Ready" : "Unavailable"}
        </div>
        <p className="mt-1">{status.message}</p>
        {status.reason ? (
          <p className="mt-1 font-mono text-[11px] opacity-80">{status.reason}</p>
        ) : null}
      </div>
    </div>
  );
}
