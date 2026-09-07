"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import {
  type ColorModeId,
  setColorMode,
  useAppearance,
} from "@/lib/appearance";
import { CONNECTOR_CONTROL_RADIUS, SHELL_G3_RADIUS } from "@/lib/shell-chrome";
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
        "inline-flex w-fit items-center gap-0.5 border-0 bg-white/45 p-1 shadow-[0_8px_24px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:bg-white/[0.06] dark:shadow-[0_8px_24px_rgba(0,0,0,0.16)]",
        SHELL_G3_RADIUS,
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
              "inline-flex items-center justify-center transition-[color,background-color,box-shadow] duration-200",
              compact ? "h-7 w-7" : "h-8 w-8",
              CONNECTOR_CONTROL_RADIUS,
              active
                ? "bg-black/[0.06] text-foreground shadow-sm dark:bg-white/[0.1]"
                : "text-muted-foreground hover:bg-black/[0.06] hover:text-foreground dark:hover:bg-white/[0.1]",
            )}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={1.6} />
          </button>
        );
      })}
    </div>
  );
}
