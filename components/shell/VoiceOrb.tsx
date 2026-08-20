"use client";

import { cn } from "@/lib/utils";

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

export function VoiceWaveform({
  bars = 12,
  className,
  barClassName,
  height = 18,
}: {
  bars?: number;
  className?: string;
  barClassName?: string;
  height?: number;
}) {
  return (
    <div
      className={cn("flex w-full items-end gap-[2px]", className)}
      style={{ height }}
    >
      {Array.from({ length: bars }).map((_, index) => (
        <span
          key={index}
          className={cn(
            "voice-bar flex-1 rounded-full bg-[oklch(0.72_0.12_252)]",
            barClassName,
          )}
          style={{
            height,
            animationDelay: `${index * 70}ms`,
          }}
        />
      ))}
    </div>
  );
}
