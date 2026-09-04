"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { FaviconImage } from "@/components/browser/FaviconImage";
import {
  filterRecentBrowserVisits,
  getBrowserRecentHistoryServerSnapshot,
  getBrowserRecentHistorySnapshot,
  subscribeBrowserRecentHistory,
} from "@/lib/browser-recent-history";
import { displayHostFromUrl } from "@/lib/preview-url";
import { cn } from "@/lib/utils";

export function BrowserAddressField({
  url,
  faviconUrl,
  draft,
  onDraftChange,
  onCommit,
  onNavigateTo,
  className,
  showFavicon = true,
  placeholder = "Search",
}: {
  url: string;
  faviconUrl?: string | null;
  draft: string;
  onDraftChange: (value: string) => void;
  onCommit: () => void;
  /** Prefer over commit when picking a suggestion (uses the exact URL). */
  onNavigateTo?: (url: string) => void;
  className?: string;
  showFavicon?: boolean;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const displayHost = displayHostFromUrl(url);
  const showPlaceholder = url === "about:blank" || !displayHost;
  const longHost = (displayHost || "").length > 28;

  useSyncExternalStore(
    subscribeBrowserRecentHistory,
    getBrowserRecentHistorySnapshot,
    getBrowserRecentHistoryServerSnapshot,
  );

  const suggestions = useMemo(
    () => filterRecentBrowserVisits(editing ? draft : "", 8),
    [editing, draft],
  );

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
    setSuggestOpen(true);
  }, [editing]);

  useEffect(() => {
    if (!editing) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setEditing(false);
        setSuggestOpen(false);
      }
    };
    window.addEventListener("mousedown", onPointer);
    return () => window.removeEventListener("mousedown", onPointer);
  }, [editing]);

  const beginEdit = () => {
    if (url !== "about:blank" && draft.trim() === url) {
      onDraftChange(displayHost || draft);
    } else if (url === "about:blank") {
      onDraftChange("");
    }
    setEditing(true);
  };

  const finishEdit = () => {
    setEditing(false);
    setSuggestOpen(false);
    onCommit();
  };

  const pickSuggestion = (nextUrl: string) => {
    setEditing(false);
    setSuggestOpen(false);
    if (onNavigateTo) {
      onNavigateTo(nextUrl);
      return;
    }
    onDraftChange(nextUrl);
    // Commit after draft settles.
    queueMicrotask(() => onCommit());
  };

  if (editing) {
    return (
      <div ref={rootRef} className={cn("relative min-w-0", className)}>
        <form
          className={cn(
            "relative",
            draft.trim().length > 28 || suggestOpen
              ? "w-[min(100%,28rem)]"
              : "w-[min(100%,14rem)]",
          )}
          onSubmit={(event) => {
            event.preventDefault();
            finishEdit();
          }}
        >
          <input
            ref={inputRef}
            value={draft}
            onChange={(event) => {
              onDraftChange(event.target.value);
              setSuggestOpen(true);
            }}
            onFocus={() => setSuggestOpen(true)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setEditing(false);
                setSuggestOpen(false);
              }
            }}
            spellCheck={false}
            aria-label="Search or enter address"
            aria-autocomplete="list"
            aria-controls={listId}
            aria-expanded={suggestOpen && suggestions.length > 0}
            placeholder={placeholder}
            className="h-8 w-full rounded-full border border-border/60 bg-input px-3 text-center text-[13px] text-foreground caret-foreground outline-none"
          />
        </form>
        {suggestOpen && suggestions.length > 0 ? (
          <ul
            id={listId}
            role="listbox"
            className="absolute top-[calc(100%+0.35rem)] left-1/2 z-40 w-[min(100vw-2rem,22rem)] -translate-x-1/2 overflow-hidden rounded-[12px] border border-border/70 bg-popover py-1 shadow-[0_12px_40px_rgba(0,0,0,0.12)]"
          >
            <li className="px-3 py-1.5 text-[11px] font-medium tracking-[0.04em] text-muted-foreground uppercase">
              Recently viewed
            </li>
            {suggestions.map((item) => {
              const host = displayHostFromUrl(item.url) || item.title;
              return (
                <li key={item.url} role="option">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-muted/70"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      pickSuggestion(item.url);
                    }}
                  >
                    <FaviconImage url={item.url} size={14} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">
                        {item.title || host}
                      </span>
                      <span className="block truncate text-[11.5px] text-muted-foreground">
                        {host}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={beginEdit}
      aria-label={placeholder}
      className={cn(
        "relative mx-auto flex h-8 items-center justify-center gap-2 rounded-full px-3 transition-colors duration-200 hover:bg-muted/50",
        longHost
          ? "min-w-0 max-w-[min(100%,22rem)] flex-1"
          : "w-auto max-w-[min(100%,14rem)] shrink-0",
        className,
      )}
    >
      {showPlaceholder ? (
        <span className="truncate text-[12px] text-muted-foreground/80">
          {placeholder}
        </span>
      ) : (
        <>
          {showFavicon ? (
            <FaviconImage url={url} faviconUrl={faviconUrl} size={14} />
          ) : null}
          <span className="truncate text-[13px] font-normal tracking-[-0.01em] text-foreground">
            {displayHost}
          </span>
        </>
      )}
    </button>
  );
}
