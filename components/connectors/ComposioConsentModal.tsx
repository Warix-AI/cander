"use client";

import Image from "next/image";
import { X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { SHELL_G3_RADIUS } from "@/lib/shell-chrome";
import { cn } from "@/lib/utils";

const MODAL_HEIGHT = "h-[47.6rem]";
const MODAL_WIDTH = "w-[min(34rem,calc(100vw-2rem))]";

const COMPOSIO_POINTS = [
  "Secure OAuth for apps like Google Drive, Gmail, and Slack",
  "Cander never stores your provider password",
  "You can disconnect anytime from Connectors",
] as const;

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
        SHELL_G3_RADIUS,
      )}
      backdropClassName="bg-black/30"
    >
      <div className="flex shrink-0 items-start justify-between gap-4 px-5 pt-5">
        <div className="min-w-0 pr-2">
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

      <div
        className={cn(
          "relative mx-5 mt-5 flex min-h-[12rem] shrink-0 items-center justify-center overflow-hidden px-5 py-6 panel-wash-host",
          SHELL_G3_RADIUS,
        )}
      >
        <div className="panel-grain" aria-hidden />
        <div className="relative flex w-full items-center justify-center">
          <Image
            src="/connectors/composio.png"
            alt="Composio"
            width={804}
            height={196}
            className="h-11 w-auto max-w-[min(100%,18rem)] object-contain drop-shadow-sm"
            priority
          />
        </div>
      </div>

      <div className="mt-5 flex min-h-0 flex-1 flex-col px-5 pb-2">
        <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
          What Composio does
        </p>
        <ul className="space-y-2.5">
          {COMPOSIO_POINTS.map((point) => (
            <li
              key={point}
              className={cn(
                "flex items-start gap-2.5 border border-border/70 px-3 py-3 text-[13px] leading-snug text-foreground/90 dark:border-white/15",
                SHELL_G3_RADIUS,
              )}
            >
              <span
                className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/55"
                aria-hidden
              />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </div>

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
