"use client";

import { X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { SHELL_G3_RADIUS } from "@/lib/shell-chrome";
import { cn } from "@/lib/utils";

const MODAL_HEIGHT = "h-[47.6rem]";
const MODAL_WIDTH = "w-[min(34rem,calc(100vw-2rem))]";

export function ComposioConsentModal({
  open,
  onClose,
  onProceed,
  busy = false,
  proceedLabel = "Proceed",
  connectorName,
}: {
  open: boolean;
  onClose: () => void;
  onProceed: () => void | Promise<void>;
  busy?: boolean;
  proceedLabel?: string;
  connectorName?: string;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="composio-consent-title"
      className={cn(
        "flex flex-col overflow-hidden",
        MODAL_HEIGHT,
        MODAL_WIDTH,
      )}
      backdropClassName="bg-black/30"
    >
      <div className="flex shrink-0 items-start justify-between gap-4 px-5 pt-5 pb-3">
        <div>
          <h2
            id="composio-consent-title"
            className="text-[16px] font-semibold tracking-[-0.03em]"
          >
            Continue with Composio
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
            Cander uses Composio to authenticate and verify
            {connectorName ? ` your ${connectorName}` : " your"} account.
            You&apos;ll be redirected to complete authorization.
          </p>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className={cn(
            "inline-flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground",
            SHELL_G3_RADIUS,
          )}
        >
          <X className="h-4 w-4" strokeWidth={1.6} />
        </button>
      </div>

      <div className="min-h-0 flex-1" />

      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border/60 px-5 py-4">
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          className={cn(
            "inline-flex h-10 items-center px-4 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50",
            SHELL_G3_RADIUS,
          )}
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onProceed()}
          className="inline-flex h-10 items-center rounded-full bg-foreground px-4 text-[13px] font-medium text-background disabled:opacity-50"
        >
          {busy ? "Working…" : proceedLabel}
        </button>
      </div>
    </Modal>
  );
}
