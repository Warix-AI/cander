"use client";

import {
  COLOR_MODE_PRESETS,
  layoutModeFor,
  setColorMode,
  setLayoutMode,
  swatchForMode,
  useAppearance,
} from "@/lib/appearance";
import { useMobileShell } from "@/lib/use-media-query";
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

  return (
    <div className={cn(compact ? "space-y-8" : "space-y-10", className)}>
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
              preview={
                <span
                  aria-hidden
                  className="block h-9 w-full rounded-[8px] border border-black/5"
                  style={{ background: swatchForMode(preset.id) }}
                />
              }
            />
          ))}
        </div>
      </section>

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
            preview={<ClassicLayoutPreview />}
          />
          <AppearanceOptionCard
            label="Floating"
            active={activeLayout === "floating"}
            onSelect={() => setLayoutMode("floating")}
            preview={<FloatingLayoutPreview />}
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
}: {
  label: string;
  active: boolean;
  onSelect: () => void;
  preview: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      className={cn(
        "flex flex-col gap-2 rounded-[10px] border px-3 py-3 text-left transition-colors duration-200",
        active
          ? "border-foreground/25 bg-muted ring-1 ring-foreground/10"
          : "border-border hover:bg-muted/60",
      )}
    >
      {preview}
      <span className="text-[13px] font-medium tracking-[-0.01em]">{label}</span>
    </button>
  );
}

function ClassicLayoutPreview() {
  return (
    <div
      aria-hidden
      className="flex h-9 w-full overflow-hidden rounded-[8px] border border-black/5 bg-muted/80"
    >
      <div className="h-full w-[28%] border-r border-black/5 bg-background" />
      <div className="h-full flex-1 bg-background" />
    </div>
  );
}

function FloatingLayoutPreview() {
  return (
    <div
      aria-hidden
      className="flex h-9 w-full gap-1 rounded-[8px] border border-black/5 bg-muted/50 p-1"
    >
      <div className="h-full w-[28%] rounded-[5px] border border-black/5 bg-background shadow-sm" />
      <div className="h-full flex-1 rounded-[5px] border border-black/5 bg-background shadow-sm" />
    </div>
  );
}
