"use client";

import type { ReactNode } from "react";
import { BookOpen, Pin, Settings, Shield } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { PanelChrome } from "@/components/panels/PanelChrome";
import { Pill } from "@/components/spaces/ItemSet";
import type { HandshakeNavId } from "@/lib/handshake";
import { cn } from "@/lib/utils";

export function HandshakeHeader({
  onNavigate,
}: {
  onNavigate: (id: HandshakeNavId) => void;
}) {
  const { isPinned, togglePin } = useApp();
  const pinned = isPinned("connector", "handshake");

  return (
    <div className="shrink-0 border-b border-border bg-sidebar">
      <PanelChrome
        kicker="Connector"
        title="Handshake"
        trailing={
          <button
            type="button"
            aria-label={pinned ? "Unpin Handshake" : "Pin Handshake"}
            title={pinned ? "Unpin" : "Pin to sidebar"}
            onClick={() => togglePin("connector", "handshake")}
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
              pinned && "text-foreground",
            )}
          >
            <Pin className="h-3.5 w-3.5" strokeWidth={1.6} />
          </button>
        }
      />
      <div className="space-y-3 px-4 pb-3">
        <div>
          <p className="text-[13px] text-muted-foreground">
            Connect your business to AI agents securely.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-chart-2/30 bg-chart-2/10 px-2.5 py-0.5 text-[11px] font-medium text-chart-2">
              <span className="h-1.5 w-1.5 rounded-full bg-chart-2" />
              Connected
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <HeaderBtn
            icon={<Settings className="h-3.5 w-3.5" strokeWidth={1.6} />}
            label="Settings"
            onClick={() => onNavigate("overview")}
          />
          <HeaderBtn
            icon={<Shield className="h-3.5 w-3.5" strokeWidth={1.6} />}
            label="Permissions"
            onClick={() => onNavigate("permissions")}
          />
          <HeaderBtn
            icon={<BookOpen className="h-3.5 w-3.5" strokeWidth={1.6} />}
            label="Documentation"
            onClick={() => onNavigate("overview")}
          />
        </div>
      </div>
    </div>
  );
}

function HeaderBtn({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Pill onClick={onClick}>
      <span className="inline-flex items-center gap-1.5">
        {icon}
        {label}
      </span>
    </Pill>
  );
}
