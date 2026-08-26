"use client";

import { useApp } from "@/components/app/AppProvider";
import { cn } from "@/lib/utils";

export function SplitHandle({
  label,
  onRatio,
  from = "left",
  min = 0.18,
  max = 0.42,
  overlay = false,
}: {
  label: string;
  onRatio: (ratio: number) => void;
  from?: "left" | "right";
  min?: number;
  max?: number;
  overlay?: boolean;
}) {
  const { setDragging } = useApp();

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      className={cn(
        "relative z-10 shrink-0 cursor-col-resize",
        overlay ? "w-0" : "w-px bg-sidebar-border hover:bg-chart-2/50",
      )}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        const handle = event.currentTarget;
        handle.setPointerCapture(event.pointerId);
        setDragging(true);
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";

        const onMove = (move: PointerEvent) => {
          const main = document.getElementById("courier-main");
          if (!main) return;
          const rect = main.getBoundingClientRect();
          const next =
            from === "right"
              ? (rect.right - move.clientX) / rect.width
              : (move.clientX - rect.left) / rect.width;
          onRatio(Math.min(max, Math.max(min, next)));
        };

        const onUp = (up: PointerEvent) => {
          if (up.pointerId !== event.pointerId) return;
          setDragging(false);
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
          if (handle.hasPointerCapture(event.pointerId)) {
            handle.releasePointerCapture(event.pointerId);
          }
          handle.removeEventListener("pointermove", onMove);
          handle.removeEventListener("pointerup", onUp);
          handle.removeEventListener("pointercancel", onUp);
        };

        handle.addEventListener("pointermove", onMove);
        handle.addEventListener("pointerup", onUp);
        handle.addEventListener("pointercancel", onUp);
      }}
    >
      <span className="absolute inset-y-0 -left-1.5 -right-1.5" />
    </div>
  );
}
