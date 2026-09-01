"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import {
  PublishDomainPicker,
  usePublishDomainOptions,
} from "@/components/preview/PublishDomainPicker";
import { resolvePublishUrl } from "@/lib/publish-domain";
import { useSpaceMutation } from "@/lib/hooks/use-space-query";

export function PublishSheet() {
  const { overlay, closeOverlay, publishApp, liveUrl, projectId } = useApp();
  const { publishBuild } = useSpaceMutation();
  const options = usePublishDomainOptions();
  const [selected, setSelected] = useState(options[0]?.id ?? "cander");
  const [busy, setBusy] = useState(false);

  const url = useMemo(
    () => resolvePublishUrl(options, selected, liveUrl),
    [options, selected, liveUrl],
  );

  if (overlay !== "publish") return null;

  const handlePublish = async () => {
    if (!projectId || busy || !url) return;
    setBusy(true);
    try {
      const result = await publishBuild(projectId, url);
      publishApp(result.url);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-[10px] border border-border bg-background p-6 shadow-[0_12px_40px_rgba(0,0,0,0.12)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase">
              Publish
            </p>
            <h2 className="heading-display mt-2 text-[1.45rem]">Publish your app</h2>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={closeOverlay}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" strokeWidth={1.6} />
          </button>
        </div>
        <p className="mt-4 text-[13px] font-medium">Publish domain</p>
        <PublishDomainPicker
          options={options}
          selected={selected}
          onSelect={setSelected}
          className="mt-2"
        />
        <p className="mt-4 text-[13px] font-medium">Environment</p>
        <p className="mt-1 text-[13px] text-muted-foreground">Production</p>
        <button
          type="button"
          disabled={busy || !projectId}
          onClick={() => void handlePublish()}
          className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-full bg-primary text-[13.5px] font-medium text-primary-foreground hover:bg-foreground disabled:opacity-50"
        >
          {busy ? "Publishing…" : "Publish"}
        </button>
      </div>
    </div>
  );
}
