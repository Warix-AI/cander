"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { DiscoveryIcon } from "@/components/discovery/DiscoveryIcon";
import { Modal } from "@/components/ui/Modal";
import {
  subscribeInstalledConnectors,
  getInstalledConnectorsSnapshot,
  getInstalledConnectorsServerSnapshot,
} from "@/lib/connector-install";
import { discoveryItemById } from "@/lib/discovery-catalog";
import {
  ensureDailyDiscovery,
  getDiscoveryServerSnapshot,
  getDiscoverySnapshot,
  markDailyModalShown,
  markDiscoveryCompleted,
  markDiscoveryDismissed,
  markDiscoveryOpened,
  markDiscoveryTried,
  shouldOfferDailyModal,
  subscribeDiscovery,
} from "@/lib/discovery-store";

const EMPTY_VISITED: [] = [];
const MODAL_DELAY_MS = 28_000;

export function DiscoveryModal() {
  const {
    overlay,
    closeOverlay,
    discoveryFocusId,
    clearDiscoveryFocus,
    openDiscovery,
    runDiscoveryAction,
  } = useApp();

  const focused = discoveryFocusId ? discoveryItemById(discoveryFocusId) : null;
  const open = overlay === "discovery";
  const item = focused;
  const [step, setStep] = useState(0);

  useEffect(() => {
    setStep(0);
  }, [item?.id, open]);

  const close = useCallback(() => {
    if (item) markDiscoveryDismissed(item.id);
    clearDiscoveryFocus();
    closeOverlay();
  }, [clearDiscoveryFocus, closeOverlay, item]);

  const softClose = useCallback(() => {
    clearDiscoveryFocus();
    closeOverlay();
  }, [clearDiscoveryFocus, closeOverlay]);

  if (!open || !item) return null;

  const steps = item.steps?.length ? item.steps : null;
  const activeStep = steps?.[step];
  const isLast = !steps || step >= steps.length - 1;
  const primary = activeStep?.action ?? item.cta;

  const onPrimary = () => {
    markDiscoveryOpened(item.id);
    if (!isLast && steps) {
      if (primary && primary !== item.cta) {
        // Intermediate step actions still navigate when present
      }
      setStep((value) => value + 1);
      return;
    }
    runDiscoveryAction(primary, item);
    if (primary.kind === "prompt" || primary.kind === "openConnector") {
      markDiscoveryTried(item.id);
    } else {
      markDiscoveryCompleted(item.id);
    }
    softClose();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      labelledBy="discovery-modal-title"
      className="w-full max-w-[32rem]"
    >
      <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-2">
        <div className="flex items-start gap-3">
          <DiscoveryIcon item={item} size="lg" />
          <div>
            <p className="text-[12px] font-medium tracking-[0.04em] text-muted-foreground uppercase">
              Did you know?
            </p>
            <h2
              id="discovery-modal-title"
              className="mt-1 text-[18px] font-semibold tracking-[-0.03em]"
            >
              {activeStep?.title ?? item.title}
            </h2>
          </div>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={close}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" strokeWidth={1.6} />
        </button>
      </div>

      <div className="px-6 pb-2">
        <p className="text-[14px] leading-relaxed text-muted-foreground">
          {activeStep?.body ?? item.description}
        </p>
        {steps && steps.length > 1 ? (
          <div className="mt-4 flex gap-1.5">
            {steps.map((_, index) => (
              <span
                key={index}
                className={
                  index === step
                    ? "h-1 w-6 rounded-full bg-foreground"
                    : "h-1 w-3 rounded-full bg-border"
                }
              />
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 px-6 pt-4 pb-6">
        <button
          type="button"
          onClick={() => {
            softClose();
            openDiscovery();
          }}
          className="mr-auto inline-flex h-9 items-center rounded-full px-3.5 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          Discover more
        </button>
        <button
          type="button"
          onClick={close}
          className="inline-flex h-9 items-center rounded-full px-3.5 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          Not now
        </button>
        <button
          type="button"
          onClick={onPrimary}
          className="inline-flex h-9 items-center rounded-full bg-primary px-4 text-[13px] font-medium tracking-[-0.01em] text-primary-foreground"
        >
          {!isLast && steps ? "Continue" : primary.label}
        </button>
      </div>
    </Modal>
  );
}

/** Once per day, after a short delay, offer the daily discovery item. */
export function DiscoveryAutoOpenListener() {
  const {
    product,
    overlay,
    billingPlan,
    entitlements,
    openDiscoveryItem,
  } = useApp();
  const store = useSyncExternalStore(
    subscribeDiscovery,
    getDiscoverySnapshot,
    getDiscoveryServerSnapshot,
  );
  const installed = useSyncExternalStore(
    subscribeInstalledConnectors,
    getInstalledConnectorsSnapshot,
    getInstalledConnectorsServerSnapshot,
  );

  const ctx = useMemo(
    () => ({
      billingPlan,
      installedConnectors: installed,
      visitedSpaces: EMPTY_VISITED,
      product,
      platformNavAllowed: entitlements.platformNavAllowed,
    }),
    [billingPlan, entitlements.platformNavAllowed, installed, product],
  );

  useEffect(() => {
    if (product !== "courier") return;
    if (!shouldOfferDailyModal()) return;
    const timer = window.setTimeout(() => {
      if (!shouldOfferDailyModal()) return;
      if (overlay) return;
      void store;
      const next = ensureDailyDiscovery(ctx);
      if (!next) return;
      markDailyModalShown();
      markDiscoveryOpened(next.id);
      openDiscoveryItem(next.id);
    }, MODAL_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [ctx, openDiscoveryItem, overlay, product, store]);

  return null;
}
