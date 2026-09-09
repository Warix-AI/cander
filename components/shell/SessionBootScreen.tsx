"use client";

import { CanderMark } from "@/components/brand/CanderMark";

export function SessionBootScreen({
  label = "Loading your account",
}: {
  label?: string;
}) {
  return (
    <div className="flex h-svh flex-col items-center justify-center bg-white text-foreground dark:bg-background">
      <div className="relative flex h-14 w-14 shrink-0 items-center justify-center">
        <span
          aria-hidden
          className="absolute inset-0 rounded-full border-[1.5px] border-foreground/10 border-t-foreground/55 motion-reduce:animate-none animate-spin"
          style={{ animationDuration: "1.1s" }}
        />
        <CanderMark tone="color" className="!h-7 !w-7" />
      </div>
      <p className="sr-only">{label}</p>
    </div>
  );
}
