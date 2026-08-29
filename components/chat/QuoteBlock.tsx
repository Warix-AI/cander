"use client";

import type { ReactNode } from "react";

export function QuoteBlock({ children }: { children: ReactNode }) {
  return (
    <blockquote className="my-2 border-l-2 border-border pl-3 text-[14px] leading-relaxed text-muted-foreground">
      {children}
    </blockquote>
  );
}
