"use client";

import { useEffect, useRef } from "react";
import {
  prefersReducedMotion,
  sampleCountForWidth,
  VOICE_WAVEFORM_STEP_MS,
  WAVEFORM_BAR_WIDTH,
  WAVEFORM_GAP,
  WAVEFORM_MAX_HEIGHT,
  WAVEFORM_MIN_HEIGHT,
  type AudioMeter,
} from "@/lib/voice/audio-meter";
import { cn } from "@/lib/utils";

/**
 * Fixed-width rolling waveform (ChatGPT-style).
 * Always draws exactly N samples for the container width — never grows denser
 * as recording continues. Newest amplitude enters on the RIGHT; oldest exits LEFT.
 */
export function VoiceDictationWaveform({
  meter,
  active = true,
  className,
  height = 36,
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
    let samples = new Float32Array(sampleCountForWidth(canvas.clientWidth || 200));
    let lastCommit = 0;
    let settle = 1; // 1 = full, 0 = faded (transcribing)

    const resizeSamples = (count: number) => {
      if (count === samples.length) return;
      const next = new Float32Array(count);
      // Preserve newest samples on the right
      const copy = Math.min(count, samples.length);
      next.set(samples.subarray(samples.length - copy), count - copy);
      samples = next;
    };

    const draw = (now: number) => {
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

      const targetCount = sampleCountForWidth(cssW);
      resizeSamples(targetCount);

      const level = meterRef.current?.getLevel() ?? 0;

      // Advance history on a fixed interval (not every frame)
      if (active && (!lastCommit || now - lastCommit >= VOICE_WAVEFORM_STEP_MS)) {
        // shift left, push newest on right
        samples.copyWithin(0, 1);
        samples[samples.length - 1] = level;
        // Live-update rightmost between commits so loudness feels immediate
        lastCommit = now;
        settle = Math.min(1, settle + 0.15);
      } else if (active && samples.length > 0) {
        samples[samples.length - 1] = level;
      }

      if (!active) {
        settle = Math.max(0, settle - 0.08);
        // Soft decay toward dots while settling into transcribe
        for (let i = 0; i < samples.length; i++) {
          samples[i] = (samples[i] ?? 0) * 0.88;
        }
      }

      ctx.clearRect(0, 0, w, h);

      const barW = WAVEFORM_BAR_WIDTH * dpr;
      const gap = WAVEFORM_GAP * dpr;
      const pitch = barW + gap;
      const n = samples.length;
      const totalW = n * pitch - gap;
      const startX = Math.max(0, (w - totalW) / 2);
      const mid = h / 2;
      const minH = WAVEFORM_MIN_HEIGHT * dpr;
      const maxH = Math.min(WAVEFORM_MAX_HEIGHT * dpr, h * 0.92);

      const styles = getComputedStyle(canvas);
      const color =
        styles.getPropertyValue("--muted-foreground").trim() ||
        styles.getPropertyValue("--foreground").trim() ||
        styles.color ||
        "#8b8b92";
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.55 + settle * 0.35;

      for (let i = 0; i < n; i++) {
        let amp = samples[i] ?? 0;
        if (reduced) amp = Math.min(amp, 0.15);
        if (!meterRef.current && active) {
          // Baseline dots while waiting for mic stream
          amp = 0;
        }
        const barH = Math.max(minH, minH + amp * (maxH - minH));
        const x = startX + i * pitch;
        const y = mid - barH / 2;
        const r = barW / 2;
        roundPill(ctx, x, y, barW, barH, r);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
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

function roundPill(
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
