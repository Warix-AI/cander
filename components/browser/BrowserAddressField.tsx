"use client";

import { useEffect, useRef, useState } from "react";
import { FaviconImage } from "@/components/browser/FaviconImage";
import { displayHostFromUrl } from "@/lib/preview-url";
import { cn } from "@/lib/utils";

export function BrowserAddressField({
  url,
  faviconUrl,
  draft,
  onDraftChange,
  onCommit,
  className,
  showFavicon = true,
}: {
  url: string;
  faviconUrl?: string | null;
  draft: string;
  onDraftChange: (value: string) => void;
  onCommit: () => void;
  className?: string;
  showFavicon?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const displayHost = displayHostFromUrl(url);
  const showPlaceholder = url === "about:blank" || !displayHost;

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  const beginEdit = () => {
    if (url !== "about:blank" && draft.trim() === url) {
      onDraftChange(displayHost || draft);
    }
    setEditing(true);
  };

  const finishEdit = () => {
    setEditing(false);
    onCommit();
  };

  if (editing) {
    return (
      <form
        className={cn("relative min-w-0 flex-1", className)}
        onSubmit={(event) => {
          event.preventDefault();
          finishEdit();
        }}
      >
        <input
          ref={inputRef}
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onBlur={finishEdit}
          spellCheck={false}
          aria-label="Address"
          placeholder="Search or enter URL"
          className="h-8 w-full rounded-full border border-border/60 bg-muted/40 px-3 text-center text-[13px] text-foreground caret-foreground outline-none"
        />
      </form>
    );
  }

  return (
    <button
      type="button"
      onClick={beginEdit}
      aria-label="Search or enter URL"
      className={cn(
        "relative mx-auto flex h-8 min-w-0 max-w-[min(100%,22rem)] flex-1 items-center justify-center gap-2 rounded-full px-3 transition-colors duration-200 hover:bg-muted/50",
        className,
      )}
    >
      {showPlaceholder ? (
        <span className="truncate text-[12px] text-muted-foreground/80">
          Search or enter URL
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
