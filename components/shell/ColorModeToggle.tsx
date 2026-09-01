"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import {
  type ColorModeId,
  setColorMode,
  useAppearance,
} from "@/lib/appearance";
import { cn } from "@/lib/utils";

const MODES: {
  id: ColorModeId;
  label: string;
  Icon: typeof Sun;
}[] = [
  { id: "system", label: "System appearance", Icon: Monitor },
  { id: "light", label: "Light appearance", Icon: Sun },
  { id: "dark", label: "Dark appearance", Icon: Moon },
];

export function ColorModeToggle({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { colorMode } = useAppearance();

  return (
    <div
      role="group"
      aria-label="Appearance"
      className={cn(
        "inline-flex w-fit items-center gap-0.5 rounded-[10px] border border-border/60 bg-muted/35 p-0.5 dark:bg-muted/25",
        className,
      )}
    >
      {MODES.map(({ id, label, Icon }) => {
        const active = colorMode === id;
        return (
          <button
            key={id}
            type="button"
            aria-label={label}
            aria-pressed={active}
            onClick={() => setColorMode(id)}
            className={cn(
              "inline-flex items-center justify-center rounded-[8px] transition-[color,background-color,box-shadow] duration-200",
              compact ? "h-7 w-7" : "h-8 w-8",
              active
                ? "bg-background text-foreground shadow-sm ring-1 ring-border/55"
                : "text-muted-foreground hover:bg-background/55 hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={1.6} />
          </button>
        );
      })}
    </div>
  );
}
