"use client";

import { useId, useState } from "react";
import { Pin, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";

const ROW =
  "flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-left text-[15px] transition-colors duration-200 hover:bg-sidebar-accent";

/**
 * Empty-state row under New / Canvas when nothing is pinned yet.
 * Opens a light overview of how pinning works.
 */
export function PinnedEmptyHint({
  className,
  rowClassName,
}: {
  className?: string;
  /** Override row chrome (e.g. mobile menu row styles). */
  rowClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(ROW, "text-muted-foreground", rowClassName)}
      >
        <Pin className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
        <span className="min-w-0 flex-1 truncate">Add pinned items</span>
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        labelledBy={titleId}
        backdropClassName="bg-black/30"
        className="w-[min(22rem,calc(100vw-2rem))]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border/60 px-5 py-4">
          <div className="min-w-0">
            <p
              id={titleId}
              className="text-[16px] font-medium tracking-[-0.02em]"
            >
              Pinned items
            </p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Keep what you use most one click away
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" strokeWidth={1.8} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4 text-[14px] leading-relaxed text-muted-foreground">
          <p>
            This space holds shortcuts to connectors, projects, chats, and more
            you pin while working. Open anything often — Gmail, a search, an
            image project — and pin it so it lives here instead of hunting
            through Canvas each time.
          </p>
          <p>
            Look for the pin icon on project cards in Canvas, on chats, and in
            connector views. Once pinned, items group into folders here
            (Connectors, Images, Searches, Chats, and so on).
          </p>
          <p>
            Pins are for speed: jump back to the same place, keep your sidebar
            tidy, and leave New + Canvas for starting something fresh.
          </p>
        </div>

        <div className="border-t border-border/60 px-5 py-3">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex h-9 w-full items-center justify-center rounded-full bg-foreground px-4 text-[13px] font-medium text-background transition-opacity hover:opacity-90"
          >
            Got it
          </button>
        </div>
      </Modal>
    </div>
  );
}
