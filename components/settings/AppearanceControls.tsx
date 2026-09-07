"use client";

import {
  COLOR_MODE_PRESETS,
  setColorMode,
  swatchForMode,
  useAppearance,
} from "@/lib/appearance";
import {
  SettingsPanel,
} from "@/components/settings/SettingsChrome";
import { useMobileShell } from "@/lib/use-media-query";
import { SHELL_G3_RADIUS } from "@/lib/shell-chrome";
import { cn } from "@/lib/utils";

export function AppearanceControls({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const appearance = useAppearance();
  const mobile = useMobileShell();
  const curve = compact ? SHELL_G3_RADIUS : undefined;

  const options = (
    <div className="grid grid-cols-3 gap-2">
      {COLOR_MODE_PRESETS.map((preset) => (
        <AppearanceOptionCard
          key={preset.id}
          label={preset.label}
          active={appearance.colorMode === preset.id}
          onSelect={() => setColorMode(preset.id)}
          mobile={mobile}
          curve={curve}
          preview={
            <span
              aria-hidden
              className={cn(
                "block w-full border border-foreground/10",
                compact ? "h-9" : "h-12",
                curve ?? SHELL_G3_RADIUS,
              )}
              style={{ background: swatchForMode(preset.id) }}
            />
          }
        />
      ))}
    </div>
  );

  if (compact) {
    return (
      <div className={cn("space-y-8", className)}>
        <section>
          <h3 className="text-[14px] font-medium tracking-[-0.01em]">Color mode</h3>
          <div className="mt-4">{options}</div>
        </section>
      </div>
    );
  }

  return (
    <div className={cn(className)}>
      <SettingsPanel className="p-2">
        {options}
      </SettingsPanel>
    </div>
  );
}

function AppearanceOptionCard({
  label,
  active,
  onSelect,
  preview,
  mobile = false,
  curve,
}: {
  label: string;
  active: boolean;
  onSelect: () => void;
  preview: React.ReactNode;
  mobile?: boolean;
  curve?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        "settings-glass-row flex flex-col gap-2 border border-transparent p-2.5 text-left transition-colors",
        curve ?? SHELL_G3_RADIUS,
        active
          ? "border-foreground/20 bg-muted/45 shadow-[inset_0_0_0_1px_oklch(0_0_0/0.04)]"
          : "hover:bg-muted/30",
        mobile && "p-2",
      )}
    >
      {preview}
      <span className="px-0.5 text-[13px] font-medium tracking-[-0.01em]">
        {label}
      </span>
    </button>
  );
}
