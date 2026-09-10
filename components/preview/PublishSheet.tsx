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
import { formatPublishUserError } from "@/lib/publish/format-publish-error";
import { usePublishStatus } from "@/lib/hooks/use-publish-status";

export function PublishSheet() {
  const { overlay, closeOverlay, publishApp, liveUrl, projectId, workspaceId } =
    useApp();
  const { publishBuild } = useSpaceMutation();
  const options = usePublishDomainOptions();
  const [selected, setSelected] = useState(options[0]?.id ?? "cander");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const publishStatus = usePublishStatus({
    projectId,
    workspaceId,
    enabled: overlay === "publish",
  });
  const isRepublish = Boolean(publishStatus?.published);
  const upToDate = Boolean(publishStatus?.published && !publishStatus.aheadOfLive);
  // A publish already running (this tab, another tab, or a previous request
  // that outlived the sheet) shows as busy — the button never fires twice.
  const publishing = busy || Boolean(publishStatus?.publishing);

  const url = useMemo(
    () => resolvePublishUrl(options, selected, liveUrl),
    [options, selected, liveUrl],
  );

  const formattedError = useMemo(
    () => (error ? formatPublishUserError(error) : null),
    [error],
  );

  if (overlay !== "publish") return null;

  const handlePublish = async () => {
    if (!projectId || publishing || !url) return;
    setBusy(true);
    setError(null);
    try {
      const result = await publishBuild(projectId, url);
      publishApp(result.url, result.verification ?? null);
      closeOverlay();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed.");
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
            <h2 className="heading-display mt-2 text-[1.45rem]">
              {isRepublish ? "Republish your site" : "Publish your app"}
            </h2>
            {publishStatus?.published ? (
              <p
                className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] ${
                  upToDate
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : "bg-amber-500/10 text-amber-800 dark:text-amber-200"
                }`}
              >
                <span
                  aria-hidden
                  className={`h-1.5 w-1.5 rounded-full ${upToDate ? "bg-emerald-500" : "bg-amber-500"}`}
                />
                {upToDate
                  ? "Live site matches your draft"
                  : "Draft is ahead of live — republish to update"}
              </p>
            ) : null}
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
        <p className="mt-4 text-[13px] font-medium">What gets published</p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          The latest version of your draft, exactly as it looks in the preview.
        </p>
        {formattedError ? (
          <div
            className={`mt-3 rounded-[10px] border px-3 py-2.5 text-[13px] leading-relaxed ${
              formattedError.draftNeedsRepair
                ? "border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-100"
                : "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300"
            }`}
            role="alert"
          >
            <p className="font-medium">{formattedError.title}</p>
            <p className="mt-1 whitespace-pre-wrap opacity-90">
              {formattedError.body}
            </p>
            {formattedError.draftNeedsRepair ? (
              <p className="mt-2 text-[12px] opacity-80">
                Tell Cander what you noticed in the chat and it will fix the draft.
              </p>
            ) : null}
          </div>
        ) : null}
        <button
          type="button"
          disabled={publishing || !projectId}
          onClick={() => void handlePublish()}
          className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-full bg-primary text-[13.5px] font-medium text-primary-foreground hover:bg-foreground disabled:opacity-50"
        >
          {publishing
            ? isRepublish
              ? "Republishing…"
              : "Publishing…"
            : isRepublish
              ? upToDate
                ? "Republish anyway"
                : "Republish"
              : "Publish"}
        </button>
      </div>
    </div>
  );
}
