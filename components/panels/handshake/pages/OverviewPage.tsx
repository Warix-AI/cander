"use client";

import { useState } from "react";
import { StatLine } from "@/components/panels/Bits";
import {
  HandshakeBadge,
  HandshakeCard,
} from "@/components/panels/handshake/HandshakeCard";
import { hs } from "@/components/panels/handshake/handshake-ui";
import {
  handshakeArchitectureLayers,
  handshakePositioning,
  handshakeStatus,
  type ArchitectureLayerId,
} from "@/lib/handshake";
import { cn } from "@/lib/utils";

export function OverviewPage() {
  const [layer, setLayer] = useState<ArchitectureLayerId>("handshake");
  const selected = handshakeArchitectureLayers.find((item) => item.id === layer);

  return (
    <div className="space-y-4 p-4">
      <HandshakeCard className="p-5">
        <p className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
          Handshake Status
        </p>
        <p className={cn("mt-2", hs.statusActive)}>{handshakeStatus.state}</p>
        <p className="mt-2 text-[14px] leading-relaxed">{handshakeStatus.headline}</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {handshakeStatus.stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-[10px] border border-border bg-card px-3 py-2.5"
            >
              <p className="text-[11px] text-muted-foreground">{stat.label}</p>
              <p className="mt-0.5 text-lg font-semibold tracking-[-0.02em]">
                {stat.value}
              </p>
            </div>
          ))}
        </div>
      </HandshakeCard>

      <HandshakeCard title="Architecture">
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          Click a layer to inspect how AI agents connect to your business.
        </p>
        <div className="mt-3 space-y-1.5">
          {handshakeArchitectureLayers.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setLayer(item.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-[13px] transition-colors",
                layer === item.id
                  ? "border-border bg-card shadow-sm"
                  : "border-transparent bg-muted/30 hover:bg-muted/50",
              )}
            >
              {index > 0 ? (
                <span className="font-mono text-[11px] text-muted-foreground">↓</span>
              ) : (
                <span className="w-3" />
              )}
              <span className="font-medium">{item.label}</span>
            </button>
          ))}
        </div>
        {selected ? (
          <div className="mt-4 rounded-[10px] border border-border bg-card p-3">
            <p className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
              {selected.label}
            </p>
            <div className="mt-2 space-y-1">
              {selected.details.map((row) => (
                <StatLine key={row.label} label={row.label} value={row.value} />
              ))}
            </div>
          </div>
        ) : null}
      </HandshakeCard>

      <HandshakeCard>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          {handshakePositioning}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <HandshakeBadge tone="neutral">No active connections</HandshakeBadge>
        </div>
      </HandshakeCard>
    </div>
  );
}
