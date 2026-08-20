"use client";

import type { HandshakeNavId } from "@/lib/handshake";
import { cn } from "@/lib/utils";

export function HandshakeNav({
  active,
  onChange,
}: {
  active: HandshakeNavId;
  onChange: (id: HandshakeNavId) => void;
}) {
  const items: { id: HandshakeNavId; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "agents", label: "Agents" },
    { id: "capabilities", label: "Capabilities" },
    { id: "permissions", label: "Permissions" },
    { id: "context", label: "Context" },
    { id: "activity", label: "Activity" },
    { id: "analytics", label: "Analytics" },
  ];

  return (
    <nav
      className="flex shrink-0 gap-0.5 overflow-x-auto border-b border-border px-2 py-1"
      aria-label="Handshake"
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={cn(
            "shrink-0 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium tracking-[-0.01em] transition-colors duration-200",
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
