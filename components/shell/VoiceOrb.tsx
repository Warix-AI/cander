"use client";

import { cn } from "@/lib/utils";

/** Static 3-bar waveform. */
export function VoiceWaveIcon({
  size = 14,
  className,
  barClassName,
}: {
  size?: number;
  className?: string;
  barClassName?: string;
}) {
  const heights = [0.48, 1, 0.62];

  return (
    <div
      className={cn("flex items-center justify-center gap-[2.5px]", className)}
      aria-hidden
    >
      {heights.map((ratio, index) => (
        <span
          key={index}
          className={cn(
            "w-[2.5px] rounded-full bg-primary-foreground",
            barClassName,
          )}
          style={{ height: Math.max(3, Math.round(size * ratio)) }}
        />
      ))}
    </div>
  );
}

export function VoiceOrb({
  active,
  onClick,
  size = 38,
  className,
  label = "Voice",
  as = "button",
}: {
  active: boolean;
  onClick?: () => void;
  size?: number;
  className?: string;
  label?: string;
  as?: "button" | "div";
}) {
  const shared = cn(
    "voice-orb relative shrink-0 overflow-hidden rounded-full",
    active && "voice-orb-live",
    className,
  );
  const style = { width: size, height: size };
  const orb = (
    <img
      src="/courier-orb.png"
      alt=""
      draggable={false}
      className="h-full w-full object-cover"
    />
  );

  if (as === "div") {
    return (
      <div
        aria-label={label}
        aria-pressed={active}
        className={shared}
        style={style}
      >
        {orb}
      </div>
    );
  }

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={shared}
      style={style}
    >
      {orb}
    </button>
  );
}

/** Static bar height pattern — reused until speech levels arrive. */
function staticBarScale(index: number, total: number) {
  const t = index / Math.max(total - 1, 1);
  return 0.22 + 0.58 * Math.abs(Math.sin(t * Math.PI * 2.4 + 0.35));
}

export function VoiceWaveform({
  bars = 12,
  className,
  barClassName,
  height = 18,
  active = false,
  speaking = false,
}: {
  bars?: number;
  className?: string;
  barClassName?: string;
  height?: number;
  active?: boolean;
  /** When true, bars animate from detected speech. Static until then. */
  speaking?: boolean;
}) {
  return (
    <div
      className={cn("flex w-full items-end gap-[2px]", className)}
      style={{ height }}
      aria-hidden
    >
      {Array.from({ length: bars }).map((_, index) => {
        const staticScale = staticBarScale(index, bars);
        const animate = active && speaking;

        return (
          <span
            key={index}
            className={cn(
              "flex-1 rounded-full",
              animate && "voice-bar voice-bar-live",
              !barClassName &&
                (active
                  ? "bg-[oklch(0.72_0.12_252)]"
                  : "bg-muted-foreground/30"),
              barClassName,
            )}
            style={{
              height: animate ? height : Math.max(3, Math.round(height * staticScale)),
              animationDelay: animate ? `${index * 70}ms` : undefined,
            }}
          />
        );
      })}
    </div>
  );
}
