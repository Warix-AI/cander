"use client";

import { useRef } from "react";
import {
  APPEARANCE_SLIDERS,
  appearanceToCss,
  setAppearanceAxis,
  useAppearance,
  type AppearanceState,
} from "@/lib/appearance";
import { cn } from "@/lib/utils";

/** Grey track at original thin size (12px) · pill 25% taller (15px). */
const TRACK_H = 12;
const THUMB_H = 15;
const THUMB_W = 30;

export function AppearanceSliders({
  className,
  compact = false,
}: {
  className?: string;
  /** Tighter copy for onboarding. */
  compact?: boolean;
}) {
  const appearance = useAppearance();
  const live = appearanceToCss(appearance);

  return (
    <div className={cn(compact ? "space-y-7" : "space-y-9", className)}>
      {APPEARANCE_SLIDERS.map((slider) => (
        <AppearanceSliderRow
          key={slider.key}
          axis={slider.key}
          label={slider.label}
          description={compact ? undefined : slider.description}
          left={slider.left}
          right={slider.right}
          binary={slider.binary}
          value={appearance[slider.key]}
          liveLabel={
            slider.showLiveLabel === "color"
              ? live.colorLabel
              : slider.showLiveLabel === "typography"
                ? live.typeLabel
                : undefined
          }
        />
      ))}
    </div>
  );
}

function AppearanceSliderRow({
  axis,
  label,
  description,
  left,
  right,
  binary,
  value,
  liveLabel,
}: {
  axis: keyof AppearanceState;
  label: string;
  description?: string;
  left: string;
  right: string;
  binary?: boolean;
  value: number;
  liveLabel?: string;
}) {
  return (
    <div className="w-full">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <p className="text-[14px] font-medium tracking-[-0.01em]">{label}</p>
          {description ? (
            <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {liveLabel ? (
          <p className="font-mono text-[11px] tracking-[0.04em] text-muted-foreground uppercase">
            {liveLabel}
          </p>
        ) : null}
      </div>
      <div className={description ? "mt-4" : "mt-3"}>
        <AppearanceRange
          label={label}
          value={value}
          binary={binary}
          valueText={liveLabel}
          onChange={(next) => setAppearanceAxis(axis, next)}
        />
        <div className="mt-2 flex justify-between font-mono text-[10.5px] tracking-[0.04em] text-muted-foreground uppercase">
          <span>{left}</span>
          <span>{right}</span>
        </div>
      </div>
    </div>
  );
}

function AppearanceRange({
  label,
  value,
  binary,
  valueText,
  onChange,
}: {
  label: string;
  value: number;
  binary?: boolean;
  valueText?: string;
  onChange: (value: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);

  const setFromClientX = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = rect.width <= 0 ? 0 : (clientX - rect.left) / rect.width;
    let next = Math.round(Math.min(1, Math.max(0, ratio)) * 100);
    if (binary) next = next >= 50 ? 100 : 0;
    onChange(next);
  };

  const thumbLeft = `calc(${value}% - ${(THUMB_W * value) / 100}px)`;

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-valuetext={valueText}
      className="relative w-full cursor-pointer touch-none select-none"
      style={{ height: THUMB_H }}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        setFromClientX(event.clientX);
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        setFromClientX(event.clientX);
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
      onKeyDown={(event) => {
        const step = binary ? 100 : event.shiftKey ? 10 : 1;
        if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
          event.preventDefault();
          onChange(Math.max(0, value - step));
        } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
          event.preventDefault();
          onChange(Math.min(100, value + step));
        } else if (event.key === "Home") {
          event.preventDefault();
          onChange(0);
        } else if (event.key === "End") {
          event.preventDefault();
          onChange(100);
        }
      }}
    >
      {/* Track — grey line */}
      <div
        aria-hidden
        className="appearance-slider-track pointer-events-none absolute inset-x-0 rounded-full bg-muted"
        style={{
          height: `${TRACK_H}px`,
          top: `${(THUMB_H - TRACK_H) / 2}px`,
        }}
      />
      {/* Pill — 25% taller than the grey track */}
      <div
        aria-hidden
        className="appearance-slider-thumb pointer-events-none absolute top-0 rounded-full bg-foreground"
        style={{
          width: `${THUMB_W}px`,
          height: `${THUMB_H}px`,
          left: thumbLeft,
          boxShadow: "0 0 0 1px color-mix(in oklch, var(--background) 35%, transparent)",
        }}
      />
    </div>
  );
}
