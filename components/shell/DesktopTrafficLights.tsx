"use client";

import { DESKTOP_NO_DRAG, getCanderDesktopBridge } from "@/lib/desktop-shell";
import { cn } from "@/lib/utils";

/** macOS-style window controls — always visible (native lights fade when unfocused). */
export function DesktopTrafficLights({ className }: { className?: string }) {
  const bridge = getCanderDesktopBridge();
  const controls = bridge?.window;
  if (!controls || bridge?.platform !== "darwin") return null;

  return (
    <div
      className={cn("flex shrink-0 items-center gap-[8px]", className)}
      style={DESKTOP_NO_DRAG}
      data-desktop-no-drag=""
    >
      <TrafficButton
        label="Close"
        color="#ff5f57"
        onClick={() => controls.close()}
      />
      <TrafficButton
        label="Minimize"
        color="#febc2e"
        onClick={() => controls.minimize()}
      />
      <TrafficButton
        label="Zoom"
        color="#28c840"
        onClick={() => controls.maximize()}
      />
    </div>
  );
}

function TrafficButton({
  label,
  color,
  onClick,
}: {
  label: string;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="inline-flex h-[13px] w-[13px] shrink-0 items-center justify-center rounded-full transition-opacity hover:opacity-85 active:opacity-70"
      style={{ backgroundColor: color }}
    />
  );
}
