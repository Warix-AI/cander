"use client";

import { useSyncExternalStore } from "react";
import { FaviconImage } from "@/components/browser/FaviconImage";
import {
  getBrowserRecentHistoryServerSnapshot,
  listRecentBrowserSites,
  subscribeBrowserRecentHistory,
} from "@/lib/browser-recent-history";
import { BROWSER_CHROME_BG } from "@/lib/shell-chrome";
import { displayHostFromUrl } from "@/lib/preview-url";
import { cn } from "@/lib/utils";

function getNewTabRecentsSnapshot() {
  return listRecentBrowserSites(8);
}

/** Blank / new-tab surface with recent browsing history (one row per site). */
export function NewTabPage({
  onOpenUrl,
}: {
  onOpenUrl?: (url: string) => void;
} = {}) {
  const recents = useSyncExternalStore(
    subscribeBrowserRecentHistory,
    getNewTabRecentsSnapshot,
    getBrowserRecentHistoryServerSnapshot,
  );

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col items-center justify-center gap-6 px-6 text-center",
        BROWSER_CHROME_BG,
      )}
    >
      <div className="space-y-1">
        <p className="text-[15px] font-medium tracking-[-0.02em] text-foreground">
          New tab
        </p>
        <p className="max-w-sm text-[13px] text-muted-foreground">
          Search or enter a URL in the address bar.
        </p>
      </div>
      {recents.length > 0 ? (
        <div className="w-full max-w-md text-left">
          <p className="mb-2 px-1 text-[12px] font-medium tracking-[0.02em] text-muted-foreground uppercase">
            Recently viewed
          </p>
          <ul className="overflow-hidden rounded-[12px] border border-border/60 bg-card/80">
            {recents.map((item) => {
              const host = displayHostFromUrl(item.url) || item.title;
              return (
                <li key={host} className="border-b border-border/40 last:border-0">
                  {onOpenUrl ? (
                    <button
                      type="button"
                      onClick={() => onOpenUrl(item.url)}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/60"
                    >
                      <FaviconImage url={item.url} size={16} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium tracking-[-0.01em]">
                          {host}
                        </span>
                      </span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <FaviconImage url={item.url} size={16} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium tracking-[-0.01em]">
                          {host}
                        </span>
                      </span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
