"use client";

import { CanderMark } from "@/components/brand/CanderMark";

export function SessionBootScreen({
  label = "Loading your account",
}: {
  label?: string;
}) {
  return (
    <div className="flex h-svh flex-col items-center justify-center bg-background text-foreground">
      <div className="flex flex-col items-center gap-6">
        <CanderMark className="!h-9 !w-[38px]" />
        <div
          className="h-0.5 w-36 overflow-hidden rounded-full bg-foreground/12"
          aria-hidden
        >
          <div className="cander-boot-line h-full w-1/3 rounded-full bg-foreground/70" />
        </div>
        <p className="sr-only">{label}</p>
      </div>
    </div>
  );
}
