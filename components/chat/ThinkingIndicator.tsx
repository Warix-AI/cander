"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** Soft pulsing "Thinking" label — no chain-of-thought exposure. */
export function ThinkingIndicator({ className }: { className?: string }) {
  const [dots, setDots] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setDots((n) => (n + 1) % 4);
    }, 450);
    return () => window.clearInterval(id);
  }, []);

  return (
    <p
      className={cn(
        "animate-pulse text-[14.5px] leading-relaxed tracking-[-0.01em] text-muted-foreground",
        className,
      )}
      aria-live="polite"
      aria-label="Thinking"
    >
      Thinking{".".repeat(dots)}
      <span className="invisible">{".".repeat(3 - dots)}</span>
    </p>
  );
}
