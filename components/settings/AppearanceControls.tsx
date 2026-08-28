"use client";

import {
  COLOR_MODE_PRESETS,
  setColorMode,
  swatchForMode,
  useAppearance,
} from "@/lib/appearance";
import {
  SettingsFootnote,
  SettingsGroup,
  SettingsSection,
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

  return (
    <div className={cn(compact ? "space-y-8" : mobile ? "space-y-6" : "space-y-10", className)}>
      {mobile ? (
        <SettingsSection title="Color mode">
          <SettingsGroup>
            <div className="grid grid-cols-2 gap-2 p-2">
              {COLOR_MODE_PRESETS.map((preset) => (
                <AppearanceOptionCard
                  key={preset.id}
                  label={preset.label}
                  active={appearance.colorMode === preset.id}
                  onSelect={() => setColorMode(preset.id)}
                  mobile
                  curve={curve}
                  preview={
                    <span
                      aria-hidden
                      className={cn(
                        "block h-9 w-full border border-black/5",
                        curve ?? "rounded-[8px]",
                      )}
                      style={{ background: swatchForMode(preset.id) }}
                    />
                  }
                />
              ))}
            </div>
          </SettingsGroup>
          <SettingsFootnote>
            Matches system, light, or dark across the app.
          </SettingsFootnote>
        </SettingsSection>
      ) : (
        <section>
          <h3 className="text-[14px] font-medium tracking-[-0.01em]">
            Color mode
          </h3>
          <div
            className={cn(
              "grid gap-2",
              compact ? "mt-4 grid-cols-2" : "mt-5 grid-cols-2",
            )}
          >
            {COLOR_MODE_PRESETS.map((preset) => (
              <AppearanceOptionCard
                key={preset.id}
                label={preset.label}
                active={appearance.colorMode === preset.id}
                onSelect={() => setColorMode(preset.id)}
                curve={curve}
                preview={
                  <span
                    aria-hidden
                    className={cn(
                      "block h-9 w-full border border-black/5",
                      curve ?? "rounded-[8px]",
                    )}
                    style={{ background: swatchForMode(preset.id) }}
                  />
                }
              />
            ))}
          </div>
        </section>
      )}
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
      className={cn(
        "flex flex-col gap-2 border p-2 text-left transition-colors",
        curve ?? "rounded-[12px]",
        active
          ? "border-foreground/25 bg-muted/40"
          : "border-border hover:border-foreground/15 hover:bg-muted/20",
        mobile && "p-2.5",
      )}
    >
      {preview}
      <span className="px-0.5 text-[13px] font-medium tracking-[-0.01em]">
        {label}
      </span>
    </button>
  );
}
