"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import { useSpaceApi, useWorkspaceCtx } from "@/components/app/SpaceDataProvider";
import type { BrowserPage } from "@/lib/space-entities";

type BrowserEngineProps = {
  projectId?: string | null;
  projectTitle?: string;
  initialUrl?: string;
  onCapture?: (ref: { sourceId: string; page: BrowserPage }) => void;
};

export function BrowserEngine({
  projectId,
  projectTitle,
  initialUrl = "https://openai.com/api/pricing",
  onCapture,
}: BrowserEngineProps) {
  const ctx = useWorkspaceCtx();
  const api = useSpaceApi();
  const { setBrowserPage } = useApp();
  const [url, setUrl] = useState(initialUrl);
  const [page, setPage] = useState<BrowserPage>({
    url: initialUrl,
    title: titleFromUrl(initialUrl),
  });

  useEffect(() => {
    void api.browser.navigate(ctx, url).then(setPage);
  }, [api.browser, ctx, url]);

  useEffect(() => {
    setBrowserPage(page);
  }, [page, setBrowserPage]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              void api.browser.navigate(ctx, url).then(setPage);
            }
          }}
          className="min-w-0 flex-1 rounded-lg bg-muted/60 px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground outline-none"
        />
        <button
          type="button"
          onClick={() => {
            void api.browser
              .captureReference(ctx, page, {
                space: "research",
                projectId: projectId ?? undefined,
              })
              .then((result) => onCapture?.({ sourceId: result.sourceId, page }));
          }}
          className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:bg-foreground"
        >
          Save source
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <p className="font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase">
          {page.url}
        </p>
        <h2 className="mt-2 text-[18px] font-medium tracking-[-0.02em]">
          {page.title}
        </h2>
        <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground">
          {projectTitle
            ? `Browsing for ${projectTitle}. Save pages as sources, then reference them in chat or Build.`
            : "Browse the web and save sources into your Home library."}
        </p>
      </div>
    </div>
  );
}

function titleFromUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
