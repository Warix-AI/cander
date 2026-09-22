"use client";

import { cn } from "@/lib/utils";

/** Static 3-bar waveform — thin futuristic bars, currentColor for chrome. */
export function VoiceWaveIcon({
  size = 14,
  className,
  barClassName,
}: {
  size?: number;
  className?: string;
  barClassName?: string;
}) {
  const heights = [0.42, 1, 0.58, 0.78];

  return (
    <div
      className={cn("flex items-center justify-center gap-[2px]", className)}
      aria-hidden
    >
      {heights.map((ratio, index) => (
        <span
          key={index}
          className={cn("w-[1.75px] rounded-full bg-current", barClassName)}
          style={{ height: Math.max(3, Math.round(size * ratio)) }}
        />
      ))}
    </div>
  );
}

export function VoiceOrb({
  active,
  speaking = false,
  onClick,
  size = 38,
  className,
  label = "Voice",
  as = "button",
}: {
  active: boolean;
  /** Slow pulse while mic/assistant audio is active. */
  speaking?: boolean;
  onClick?: () => void;
  size?: number;
  className?: string;
  label?: string;
  as?: "button" | "div";
}) {
  const shared = cn(
    "voice-orb relative shrink-0 rounded-full",
    active && "voice-orb-live",
    active && speaking && "voice-orb-speaking",
    className,
  );
  const style = { width: size, height: size };
  const orb = (
    <img
      src="/cander-orb.png?v=17"
      alt=""
      draggable={false}
      className="h-full w-full object-contain"
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
