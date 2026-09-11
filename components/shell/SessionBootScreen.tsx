"use client";

import { CanderMark } from "@/components/brand/CanderMark";

export function SessionBootScreen({
  label = "Loading your account",
}: {
  label?: string;
}) {
  return (
    <div className="flex h-svh flex-col items-center justify-center bg-white text-foreground dark:bg-background">
      {/* 25% larger than prior h-7/w-7 (28px → 35px) for refresh/reboot visibility */}
      <CanderMark tone="color" className="!h-[35px] !w-[35px]" />
      <p className="sr-only">{label}</p>
    </div>
  );
}
