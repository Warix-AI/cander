"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { FaviconImage } from "@/components/browser/FaviconImage";
import { NativeOverlayGate } from "@/components/browser/NativeOverlayGate";
import {
  filterRecentBrowserVisits,
  getBrowserRecentHistoryServerSnapshot,
  getBrowserRecentHistorySnapshot,
  subscribeBrowserRecentHistory,
} from "@/lib/browser-recent-history";
import { displayHostFromUrl } from "@/lib/preview-url";
import { cn } from "@/lib/utils";

const ADDRESS_FIELD_WIDTH =
  "relative mx-auto min-w-0 w-full max-w-[min(100%,22rem)]";

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
  /** When this key changes to a blank-tab id, enter edit mode and focus. */
  autoEditKey = null,
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
  autoEditKey?: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const lastAutoEditKey = useRef<string | null>(null);
  const listId = useId();
  const displayHost = displayHostFromUrl(url);
  const showPlaceholder = url === "about:blank" || !displayHost;

  useSyncExternalStore(
    subscribeBrowserRecentHistory,
    getBrowserRecentHistorySnapshot,
    getBrowserRecentHistoryServerSnapshot,
  );

  const typedQuery = editing ? draft.trim() : "";
  const suggestions = useMemo(
    () => (typedQuery ? filterRecentBrowserVisits(typedQuery, 8) : []),
    [typedQuery],
  );
  const showSuggestions =
    suggestOpen && typedQuery.length > 0 && suggestions.length > 0;

  const placeMenu = () => {
    const el = rootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setMenuPos({
      top: rect.bottom + 6,
      left: rect.left + rect.width / 2,
      width: Math.max(rect.width, 256),
    });
  };

  const beginEdit = () => {
    // Idle shows host only; editing always expands to the full URL.
    onDraftChange(url === "about:blank" ? "" : url);
    setEditing(true);
    setSuggestOpen(true);
  };

  useEffect(() => {
    if (!autoEditKey) return;
    if (lastAutoEditKey.current === autoEditKey) return;
    lastAutoEditKey.current = autoEditKey;
    beginEdit();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to key changes
  }, [autoEditKey]);

  useEffect(() => {
    if (!editing) return;
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    // Existing URL: select once for quick replace. Blank tab: caret only.
    if (url !== "about:blank" && input.value) {
      input.select();
    }
  }, [editing, url]);

  useEffect(() => {
    if (!showSuggestions) {
      setMenuPos(null);
      return;
    }
    placeMenu();
    const onMove = () => placeMenu();
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [showSuggestions, typedQuery, suggestions.length]);

  useEffect(() => {
    if (!editing) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (
        target instanceof Element &&
        target.closest(`[data-browser-suggest="${listId}"]`)
      ) {
        return;
      }
      setEditing(false);
      setSuggestOpen(false);
    };
    window.addEventListener("mousedown", onPointer);
    return () => window.removeEventListener("mousedown", onPointer);
  }, [editing, listId]);

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
    queueMicrotask(() => onCommit());
  };

  if (editing) {
    return (
      <div ref={rootRef} className={cn(ADDRESS_FIELD_WIDTH, className)}>
        <NativeOverlayGate open={showSuggestions} />
        <form
          className="relative w-full"
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
            aria-expanded={showSuggestions}
            placeholder={placeholder}
            className="h-8 w-full rounded-full border border-border/60 bg-input px-3 text-center text-[13px] text-foreground caret-foreground outline-none placeholder:text-center"
          />
        </form>
        {showSuggestions && menuPos
          ? createPortal(
              <ul
                id={listId}
                data-browser-suggest={listId}
                role="listbox"
                style={{
                  top: menuPos.top,
                  left: menuPos.left,
                  width: menuPos.width,
                  transform: "translateX(-50%)",
                }}
                className="pointer-events-auto fixed z-[360] overflow-hidden rounded-[12px] border border-border/70 bg-popover py-1 shadow-[0_12px_40px_rgba(0,0,0,0.18)]"
              >
                <li className="px-3 py-1.5 text-[11px] font-medium tracking-[0.04em] text-muted-foreground uppercase">
                  Recently viewed
                </li>
                {suggestions.map((item) => {
                  const host = displayHostFromUrl(item.url) || item.title;
                  return (
                    <li key={host} role="option">
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
                            {host}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>,
              document.body,
            )
          : null}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={beginEdit}
      aria-label={placeholder}
      className={cn(
        ADDRESS_FIELD_WIDTH,
        "flex h-8 flex-1 items-center justify-center gap-2 rounded-full px-3 transition-colors duration-200 hover:bg-muted/50",
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
