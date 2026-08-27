"use client";

import {
  COLOR_MODE_PRESETS,
  layoutModeFor,
  setColorMode,
  setLayoutMode,
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
  const activeLayout = layoutModeFor(appearance.layout);
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

      {mobile ? null : (
      <section>
        <h3 className="text-[14px] font-medium tracking-[-0.01em]">Layout</h3>
        {!compact ? (
          <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
            Edge-to-edge classic or inset floating chrome.
          </p>
        ) : null}
        <div
          className={cn(
            "grid gap-2",
            compact ? "mt-4 grid-cols-2" : "mt-5 grid-cols-2 sm:grid-cols-4",
          )}
        >
          <AppearanceOptionCard
            label="Classic"
            active={activeLayout === "classic"}
            onSelect={() => setLayoutMode("classic")}
            curve={curve}
            preview={<ClassicLayoutPreview curve={curve} />}
          />
          <AppearanceOptionCard
            label="Floating"
            active={activeLayout === "floating"}
            onSelect={() => setLayoutMode("floating")}
            curve={curve}
            preview={<FloatingLayoutPreview curve={curve} />}
          />
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
      aria-pressed={active}
      onClick={onSelect}
      className={cn(
        "flex flex-col gap-2 bg-card px-3 py-3 text-left transition-colors duration-200",
        curve ?? (mobile ? "rounded-[12px]" : "rounded-[10px]"),
        mobile
          ? "border border-border bg-card"
          : cn(
              "border",
              active
                ? "border-foreground/25 bg-muted ring-1 ring-foreground/10"
                : "border-border hover:bg-muted/60",
            ),
      )}
    >
      {preview}
      <span className="text-[13px] font-medium tracking-[-0.01em]">{label}</span>
    </button>
  );
}

function ClassicLayoutPreview({ curve }: { curve?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "flex h-9 w-full overflow-hidden border border-black/5 bg-muted/80",
        curve ?? "rounded-[8px]",
      )}
    >
      <div className="h-full w-[28%] border-r border-black/5 bg-background" />
      <div className="h-full flex-1 bg-background" />
    </div>
  );
}

function FloatingLayoutPreview({ curve }: { curve?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "flex h-9 w-full gap-1 border border-black/5 bg-muted/50 p-1",
        curve ?? "rounded-[8px]",
      )}
    >
      <div
        className={cn(
          "h-full w-[28%] border border-black/5 bg-background shadow-sm",
          curve ?? "rounded-[5px]",
        )}
      />
      <div
        className={cn(
          "h-full flex-1 border border-black/5 bg-background shadow-sm",
          curve ?? "rounded-[5px]",
        )}
      />
    </div>
  );
}
