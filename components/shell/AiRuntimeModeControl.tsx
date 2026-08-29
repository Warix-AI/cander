"use client";

import { useEffect, useState } from "react";
import {
  getAiRuntimeMode,
  setAiRuntimeMode,
  subscribeAiRuntimeMode,
} from "@/lib/ai/runtime/mode-store";
import type { AiRuntimeMode } from "@/lib/ai/runtime/types";
import { cn } from "@/lib/utils";

const OPTIONS: { id: AiRuntimeMode; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "local", label: "On device" },
  { id: "cloud", label: "Cloud" },
];

/**
 * Smallest useful control to verify which runtime path is selected.
 * LOCAL never silently falls back to cloud.
 */
export function AiRuntimeModeControl({ className }: { className?: string }) {
  const [mode, setMode] = useState<AiRuntimeMode>("auto");

  useEffect(() => {
    setMode(getAiRuntimeMode());
    return subscribeAiRuntimeMode(() => setMode(getAiRuntimeMode()));
  }, []);

  return (
    <div
      className={cn(
        "flex items-center gap-0.5 rounded-md border border-border/60 bg-background/80 p-0.5 text-[10px] text-muted-foreground",
        className,
      )}
      title="AI runtime (LOCAL never sends prompts to cloud for inference)"
      role="group"
      aria-label="AI runtime"
    >
      {OPTIONS.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => {
            setAiRuntimeMode(opt.id);
            setMode(opt.id);
          }}
          className={cn(
            "rounded px-1.5 py-0.5 transition-colors",
            mode === opt.id
              ? "bg-muted text-foreground"
              : "hover:text-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
