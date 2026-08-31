"use client";

import { useEffect, useRef } from "react";
import { prefersReducedMotion, type AudioMeter } from "@/lib/voice/audio-meter";
import { cn } from "@/lib/utils";

/**
 * Canvas waveform driven by live AudioMeter history.
 * Imperative rAF drawing — no per-frame React state.
 */
export function VoiceDictationWaveform({
  meter,
  active = true,
  className,
  height = 28,
}: {
  meter: AudioMeter | null;
  active?: boolean;
  className?: string;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const meterRef = useRef(meter);
  meterRef.current = meter;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = prefersReducedMotion();
    let raf = 0;
    let running = true;
    let phase = 0;

    const draw = () => {
      if (!running) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = canvas.clientWidth || 200;
      const cssH = height;
      const w = Math.max(1, Math.floor(cssW * dpr));
      const h = Math.max(1, Math.floor(cssH * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }

      ctx.clearRect(0, 0, w, h);

      const m = meterRef.current;
      const history = m?.getHistory() ?? new Float32Array(48);
      const n = Math.max(history.length, 24);
      const gap = Math.max(1.5 * dpr, w / n / 4);
      const barW = Math.max(2 * dpr, (w - gap * (n - 1)) / n);
      const mid = h / 2;
      const maxBar = h * 0.92;

      // Theme-aware color from computed style
      const styles = getComputedStyle(canvas);
      const color =
        styles.getPropertyValue("--foreground").trim() ||
        styles.color ||
        "#3f3f46";
      ctx.fillStyle = color;

      for (let i = 0; i < n; i++) {
        let amp = history[i] ?? 0;
        if (!active || !m) {
          amp = reduced ? 0.08 : 0.06 + 0.02 * Math.sin(phase + i * 0.35);
        }
        // Quiet floor as small dots
        const barH = Math.max(2 * dpr, amp * maxBar);
        const x = i * (barW + gap);
        const y = mid - barH / 2;
        const r = Math.min(barW / 2, 2 * dpr);
        roundRect(ctx, x, y, barW, barH, r);
        ctx.globalAlpha = 0.35 + amp * 0.55;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      phase += 0.08;
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
    };
  }, [active, height]);

  return (
    <canvas
      ref={canvasRef}
      className={cn("block w-full", className)}
      style={{ height }}
      aria-hidden
    />
  );
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
