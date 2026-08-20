"use client";

import { gmailNav, type GmailNavId } from "@/lib/gmail";
import { cn } from "@/lib/utils";

export function GmailNav({
  active,
  onChange,
}: {
  active: GmailNavId;
  onChange: (id: GmailNavId) => void;
}) {
  return (
    <nav
      className="flex shrink-0 gap-1 overflow-x-auto border-b border-border px-2 py-1.5"
      aria-label="Gmail"
    >
      {gmailNav.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={cn(
            "shrink-0 rounded-lg px-2.5 py-1.5 text-[12px] font-medium tracking-[-0.01em] transition-colors duration-200",
            active === item.id
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
          )}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}
