"use client";

import { X } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { ProjectDomainsManager } from "@/components/preview/PublishDomainPicker";

export function DomainsSheet() {
  const { overlay, closeOverlay } = useApp();
  if (overlay !== "domains") return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-[10px] border border-border bg-background p-6 shadow-[0_12px_40px_rgba(0,0,0,0.12)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase">
              Build
            </p>
            <h2 className="heading-display mt-2 text-[1.45rem]">Domains</h2>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={closeOverlay}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" strokeWidth={1.6} />
          </button>
        </div>
        <div className="mt-4">
          <ProjectDomainsManager compact />
        </div>
      </div>
    </div>
  );
}
