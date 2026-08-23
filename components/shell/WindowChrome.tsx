"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { ArrowLeft, ArrowRight, Search, Settings, Zap } from "lucide-react";
import { NavToggle } from "@/components/shell/NavToggle";
import { useApp } from "@/components/app/AppProvider";
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
import { cn } from "@/lib/utils";

const EMPTY_VISITED: [] = [];

function isRevealItem(category: string) {
  return category === "connector" || category === "new_feature";
}

export function WindowChrome() {
  return (
    <div className="flex h-11 shrink-0 items-center gap-1 px-2">
      <NavToggle />
      <HistoryButtons />
    </div>
  );
}

function HistoryButtons() {
  const {
    canGoBack,
    canGoForward,
    goBack,
    goForward,
    openOverlay,
    openDiscovery,
    openSettings,
    product,
    view,
    billingPlan,
    entitlements,
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

  const tip = useMemo(() => {
    void store;
    if (product !== "courier") return null;
    return peekDailyDiscovery(ctx);
  }, [ctx, product, store]);

  const tipActive = Boolean(tip && isRevealItem(tip.category));
  const discoveryActive = view === "discovery";
  const settingsActive = view === "settings";
  const showDiscovery = product === "courier";

  return (
    <div className="flex min-w-0 flex-1 items-center">
      <button
        type="button"
        aria-label="Search"
        onClick={() => openOverlay("search")}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-sidebar-foreground/75 transition-colors duration-200 hover:bg-sidebar-accent hover:text-foreground"
      >
        <Search className="h-4 w-4" strokeWidth={1.7} />
      </button>
      {showDiscovery ? (
        <button
          type="button"
          aria-label={
            tipActive && tip
              ? `Discovery. Did you know? ${tip.shortLabel}`
              : "Discovery"
          }
          onClick={() => openDiscovery()}
          className={cn(
            "relative inline-flex h-8 w-8 items-center justify-center rounded-lg text-sidebar-foreground/75 transition-colors duration-200 hover:bg-sidebar-accent hover:text-foreground",
            discoveryActive && "bg-sidebar-accent text-foreground",
          )}
        >
          <Zap className="h-4 w-4" strokeWidth={1.7} />
          {tipActive ? (
            <span
              className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-foreground"
              aria-hidden
            />
          ) : null}
        </button>
      ) : null}
      <button
        type="button"
        aria-label="Settings"
        onClick={() => openSettings()}
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-lg text-sidebar-foreground/75 transition-colors duration-200 hover:bg-sidebar-accent hover:text-foreground",
          settingsActive && "bg-sidebar-accent text-foreground",
        )}
      >
        <Settings className="h-4 w-4" strokeWidth={1.7} />
      </button>
      <div className="ml-auto flex items-center">
        <button
          type="button"
          aria-label="Back"
          disabled={!canGoBack}
          onClick={goBack}
          className={cn(
            "inline-flex h-8 w-8 items-center justify-center rounded-lg text-sidebar-foreground/75 transition-colors duration-200",
            canGoBack
              ? "hover:bg-sidebar-accent hover:text-foreground"
              : "opacity-35",
          )}
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.7} />
        </button>
        <button
          type="button"
          aria-label="Forward"
          disabled={!canGoForward}
          onClick={goForward}
          className={cn(
            "inline-flex h-8 w-8 items-center justify-center rounded-lg text-sidebar-foreground/75 transition-colors duration-200",
            canGoForward
              ? "hover:bg-sidebar-accent hover:text-foreground"
              : "opacity-35",
          )}
        >
          <ArrowRight className="h-4 w-4" strokeWidth={1.7} />
        </button>
      </div>
    </div>
  );
}
