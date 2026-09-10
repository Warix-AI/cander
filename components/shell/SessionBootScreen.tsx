"use client";

import { CanderMark } from "@/components/brand/CanderMark";

export function SessionBootScreen({
  label = "Loading your account",
}: {
  label?: string;
}) {
  return (
    <div className="flex h-svh flex-col items-center justify-center bg-white text-foreground dark:bg-background">
      <CanderMark tone="color" className="!h-7 !w-7" />
      <p className="sr-only">{label}</p>
    </div>
  );
}
