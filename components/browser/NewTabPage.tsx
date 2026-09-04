"use client";

import { useSyncExternalStore } from "react";
import { FaviconImage } from "@/components/browser/FaviconImage";
import {
  getBrowserRecentHistoryServerSnapshot,
  listRecentBrowserVisits,
  subscribeBrowserRecentHistory,
} from "@/lib/browser-recent-history";
import { displayHostFromUrl } from "@/lib/preview-url";

/** Blank / new-tab surface with recent browsing history. */
export function NewTabPage({
  onOpenUrl,
}: {
  onOpenUrl?: (url: string) => void;
} = {}) {
  const recents = useSyncExternalStore(
    subscribeBrowserRecentHistory,
    () => listRecentBrowserVisits(5),
    getBrowserRecentHistoryServerSnapshot,
  );

  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-6 bg-background px-6 text-center">
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
          <ul className="overflow-hidden rounded-[12px] border border-border/60 bg-card">
            {recents.map((item) => {
              const host = displayHostFromUrl(item.url) || item.title;
              return (
                <li key={item.url} className="border-b border-border/40 last:border-0">
                  {onOpenUrl ? (
                    <button
                      type="button"
                      onClick={() => onOpenUrl(item.url)}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/60"
                    >
                      <FaviconImage url={item.url} size={16} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium tracking-[-0.01em]">
                          {item.title || host}
                        </span>
                        <span className="block truncate text-[12px] text-muted-foreground">
                          {host}
                        </span>
                      </span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <FaviconImage url={item.url} size={16} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium tracking-[-0.01em]">
                          {item.title || host}
                        </span>
                        <span className="block truncate text-[12px] text-muted-foreground">
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
