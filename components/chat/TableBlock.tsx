"use client";

import type { ReactNode } from "react";

export function TableBlock({ children }: { children: ReactNode }) {
  return (
    <div className="my-2 max-w-full overflow-x-auto rounded-[10px] border border-border [scrollbar-width:thin]">
      <table className="min-w-full border-collapse text-left text-[13.5px] leading-snug">
        {children}
      </table>
    </div>
  );
}
