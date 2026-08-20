"use client";

import { handshakeNav, type HandshakeNavId } from "@/lib/handshake";
import { hs } from "@/components/panels/handshake/handshake-ui";
import { cn } from "@/lib/utils";

export function HandshakeNav({
  active,
  onChange,
}: {
  active: HandshakeNavId;
  onChange: (id: HandshakeNavId) => void;
}) {
  return (
    <nav
      className="flex shrink-0 gap-1 overflow-x-auto border-b border-border px-2 py-1.5"
      aria-label="Handshake"
    >
      {handshakeNav.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={cn(
            "shrink-0 rounded-lg px-2.5 py-1.5 text-[12px] font-medium tracking-[-0.01em] transition-colors duration-200",
            active === item.id ? hs.navActive : hs.navIdle,
          )}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}
