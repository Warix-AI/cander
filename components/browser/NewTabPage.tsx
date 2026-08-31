"use client";

/** Neutral new-tab surface — prompts use of the address bar (not a fake search engine). */
export function NewTabPage() {
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-2 bg-background px-6 text-center">
      <p className="text-sm font-medium text-foreground">New tab</p>
      <p className="max-w-sm text-[13px] text-muted-foreground">
        Type a URL or search term in the address bar above.
      </p>
    </div>
  );
}
