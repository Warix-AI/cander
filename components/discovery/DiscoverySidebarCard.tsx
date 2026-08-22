"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useApp } from "@/components/app/AppProvider";
import { DiscoveryIcon } from "@/components/discovery/DiscoveryIcon";
import { DiscoveryMark } from "@/components/discovery/DiscoveryMark";
import {
  subscribeInstalledConnectors,
  getInstalledConnectorsSnapshot,
  getInstalledConnectorsServerSnapshot,
} from "@/lib/connector-install";
import {
  ensureDailyDiscovery,
  getDiscoveryServerSnapshot,
  getDiscoverySnapshot,
  peekDailyDiscovery,
  subscribeDiscovery,
} from "@/lib/discovery-store";
import { SIDEBAR_FOOTER_ROW } from "@/components/shell/AccountMenu";
import { cn } from "@/lib/utils";

const EMPTY_VISITED: [] = [];

/** Reveal-style tips use “Did you know?”; everything else is the Discovery entry. */
function isRevealItem(category: string) {
  return category === "connector" || category === "new_feature";
}

export function DiscoverySidebarCard() {
  const {
    billingPlan,
    entitlements,
    openDiscovery,
    product,
    view,
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
    ensureDailyDiscovery(ctx);
  }, [ctx, product]);

  const item = useMemo(() => {
    void store;
    return peekDailyDiscovery(ctx);
  }, [ctx, store]);

  if (product !== "courier") return null;

  const reveal = Boolean(item && isRevealItem(item.category));
  const title = reveal ? "Did you know?" : "Discovery";
  const subtitle = reveal
    ? item!.shortLabel
    : item && !isRevealItem(item.category)
      ? item.shortLabel
      : "Tactics & capabilities";

  return (
    <button
      type="button"
      onClick={() => openDiscovery()}
      className={cn(
        SIDEBAR_FOOTER_ROW,
        "mb-1",
        view === "discovery" && "bg-sidebar-accent",
      )}
      aria-label={`${title}. ${subtitle}`}
    >
      {reveal && item ? (
        <DiscoveryIcon item={item} size="md" />
      ) : (
        <DiscoveryMark />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] leading-tight font-medium">
          {title}
        </span>
        <span className="mt-0.5 block truncate text-[11px] leading-tight text-muted-foreground">
          {subtitle}
        </span>
      </span>
    </button>
  );
}
