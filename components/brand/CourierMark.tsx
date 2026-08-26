"use client";

import { cn } from "@/lib/utils";

export function CourierMark({
  className,
}: {
  className?: string;
}) {
  return (
    <img
      src="/cander-mark.png?v=7"
      alt=""
      aria-hidden="true"
      width={369}
      height={369}
      className={cn("h-[29.7px] w-[31px] object-contain", className)}
    />
  );
}
