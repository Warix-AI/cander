"use client";

import { useApp } from "@/components/app/AppProvider";
import { DefaultChatPreviewWash } from "@/components/spaces/BannerWash";
import { buildPreviews } from "@/lib/data";
import type { BuildSandboxStatus } from "@/lib/build/sandbox/constants";
import { displayHostFromUrl } from "@/lib/preview-url";
import { cn } from "@/lib/utils";

/**
 * Build project preview — live iframe via Cander path proxy when ready.
 * Publish does not replace this draft surface; live URL is shown beside draft.
 */
export function AppViewport({
  name,
  summary,
  envStatus,
  envMessage,
  onRetryEnv,
  previewSrc,
  draftPreviewUrl,
  publishedUrl,
  onReloadPreview,
}: {
  name: string;
  summary: string;
  envStatus?: BuildSandboxStatus | null;
  envMessage?: string | null;
  onRetryEnv?: () => void;
  /** Same-origin preview proxy URL */
  previewSrc?: string | null;
  /** Draft host shown in the live-preview badge (e.g. draft--sub.cander.app) */
  draftPreviewUrl?: string | null;
  /** Production URL after publish — shown alongside draft, does not replace iframe */
  publishedUrl?: string | null;
  onReloadPreview?: () => void;
}) {
  const { viewport, previewKey, project } = useApp();

  const framed = viewport !== "desktop";
  const cover =
    project?.cover ??
    buildPreviews.find((item) => item.projectId === project?.id)?.image;

  const showEnvOverlay =
    envStatus === "starting" ||
    envStatus === "error" ||
    envStatus === "unavailable" ||
    envStatus === "needs_repo";

  const showLive = envStatus === "ready" && Boolean(previewSrc);
  const emptyCopy =
    summary?.trim() || "Start generating your website in chat.";
  const draftHost = draftPreviewUrl
    ? displayHostFromUrl(draftPreviewUrl) || draftPreviewUrl
    : null;
  const liveHost = publishedUrl
    ? displayHostFromUrl(publishedUrl) || publishedUrl
    : null;

  return (
    <div
      className={cn(
        "flex h-full min-h-0 justify-center",
        framed ? "items-center bg-white p-4 dark:bg-muted/40" : "items-stretch",
      )}
    >
      <div
        key={previewKey}
        className={cn(
          "relative overflow-hidden",
          viewport === "desktop" && "h-full min-h-0 w-full rounded-none",
          viewport === "tablet" &&
            "h-full w-auto max-w-full aspect-[3/4] rounded-[10px] shadow-[0_16px_40px_rgba(0,0,0,0.28)]",
          viewport === "mobile" &&
            "h-full w-auto max-w-full aspect-[9/19.5] rounded-[18px] shadow-[0_16px_40px_rgba(0,0,0,0.28)]",
        )}
      >
        {showLive ? (
          <iframe
            title={`${name} preview`}
            src={previewSrc!}
            className="absolute inset-0 h-full w-full border-0 bg-white"
            sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-modals"
            allow="clipboard-read; clipboard-write"
          />
        ) : cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-top"
          />
        ) : (
          <>
            <DefaultChatPreviewWash />
            <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center text-white">
              <p className="text-[1.5rem] font-semibold tracking-[-0.03em] md:text-[1.75rem]">
                {name}
              </p>
              <p className="mt-2 max-w-sm text-[13.5px] leading-relaxed text-white/75">
                {emptyCopy}
              </p>
            </div>
          </>
        )}

        {showEnvOverlay ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/55 px-6 text-center backdrop-blur-[2px]">
            <p className="text-[14px] font-medium tracking-[-0.02em] text-white">
              {envStatus === "starting"
                ? "Starting environment…"
                : envStatus === "needs_repo"
                  ? "Preparing project repository…"
                  : envStatus === "unavailable"
                    ? "Environment unavailable"
                    : "Environment failed to start"}
            </p>
            {envMessage ? (
              <p className="mt-2 max-w-sm text-[12.5px] leading-relaxed text-white/70">
                {envMessage}
              </p>
            ) : null}
            {(envStatus === "error" || envStatus === "unavailable") &&
            onRetryEnv ? (
              <button
                type="button"
                onClick={onRetryEnv}
                className="mt-4 inline-flex h-9 items-center rounded-full bg-white px-4 text-[13px] font-medium text-foreground hover:bg-white/90"
              >
                Retry
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="absolute bottom-3 left-3 z-10 flex max-w-[min(100%-1.5rem,36rem)] flex-wrap items-center gap-2">
          {liveHost ? (
            <span className="min-w-0 truncate rounded-full bg-emerald-700/90 px-3 py-1 text-[11px] font-medium tracking-[-0.01em] text-white">
              Published · {liveHost}
            </span>
          ) : null}
          {showLive ? (
            <>
              <span className="min-w-0 truncate rounded-full bg-black/50 px-3 py-1 text-[11px] font-medium tracking-[-0.01em] text-white/90">
                {draftHost ? `Draft · ${draftHost}` : "Draft preview"}
              </span>
              {onReloadPreview ? (
                <button
                  type="button"
                  onClick={onReloadPreview}
                  className="shrink-0 rounded-full bg-black/50 px-3 py-1 text-[11px] font-medium text-white/90 hover:bg-black/70"
                >
                  Reload
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
