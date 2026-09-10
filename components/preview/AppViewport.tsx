"use client";

import { CanderMark } from "@/components/brand/CanderMark";
import { useApp } from "@/components/app/AppProvider";
import { DefaultChatPreviewWash } from "@/components/spaces/BannerWash";
import { WebsiteSetupProgress } from "@/components/preview/WebsiteSetupProgress";
import { buildPreviews } from "@/lib/data";
import type { BuildSandboxStatus } from "@/lib/build/sandbox/constants";
import { cn } from "@/lib/utils";

/**
 * Build project preview — live iframe via Cander path proxy when ready.
 * Publish does not replace this draft surface; live URL is shown beside draft.
 * During guided website setup: blank canvas + Cander 8-segment progress ring.
 */
export function AppViewport({
  name,
  summary,
  envStatus,
  envMessage: _envMessage,
  onRetryEnv,
  previewSrc,
  draftPreviewUrl: _draftPreviewUrl,
  publishedUrl: _publishedUrl,
  onReloadPreview: _onReloadPreview,
  websiteSetup,
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
  /** Guided website setup progress (blank canvas until ready) */
  websiteSetup?: {
    status: "setup" | "building" | "ready" | "failed";
    completedSteps: number;
    detail?: string | null;
    steps?: string[] | null;
  } | null;
}) {
  const { viewport, project } = useApp();

  const framed = viewport !== "desktop";
  const cover =
    project?.cover ??
    buildPreviews.find((item) => item.projectId === project?.id)?.image;

  const setupActive =
    websiteSetup &&
    (websiteSetup.status === "setup" ||
      websiteSetup.status === "building" ||
      websiteSetup.status === "failed");

  const showEnvOverlay =
    !setupActive &&
    (envStatus === "starting" ||
      envStatus === "error" ||
      envStatus === "unavailable" ||
      envStatus === "needs_repo" ||
      (envStatus === "ready" && !previewSrc));

  const showLive =
    !setupActive && envStatus === "ready" && Boolean(previewSrc);
  const emptyCopy =
    summary?.trim() || "Start generating your website in chat.";

  return (
    <div
      className={cn(
        "flex h-full min-h-0 justify-center",
        framed ? "items-center bg-white p-4 dark:bg-muted/40" : "items-stretch",
      )}
    >
      <div
        className={cn(
          "relative overflow-hidden",
          viewport === "desktop" && "h-full min-h-0 w-full rounded-none",
          viewport === "tablet" &&
            "h-full w-auto max-w-full aspect-[3/4] rounded-[10px] shadow-[0_16px_40px_rgba(0,0,0,0.28)]",
          viewport === "mobile" &&
            "h-full w-auto max-w-full aspect-[9/19.5] rounded-[18px] shadow-[0_16px_40px_rgba(0,0,0,0.28)]",
        )}
      >
        {setupActive ? (
          <div className="absolute inset-0 bg-white">
            <WebsiteSetupProgress
              completedSteps={websiteSetup.completedSteps}
              mode={
                websiteSetup.status === "building"
                  ? "building"
                  : websiteSetup.status === "failed"
                    ? "failed"
                    : "setup"
              }
              detail={websiteSetup.detail}
              steps={websiteSetup.steps}
              onRetry={
                websiteSetup.status === "failed" ? onRetryEnv : undefined
              }
            />
          </div>
        ) : showLive ? (
          <iframe
            title={`${name} preview`}
            src={previewSrc!}
            className="absolute inset-0 h-full w-full border-0 bg-white"
            sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-modals"
            allow="clipboard-read; clipboard-write"
          />
        ) : showEnvOverlay ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white px-6 text-center">
            <div className="relative flex h-11 w-11 shrink-0 items-center justify-center">
              {(envStatus === "starting" ||
                envStatus === "needs_repo" ||
                (envStatus === "ready" && !previewSrc) ||
                envStatus === "error" ||
                envStatus === "unavailable") && (
                <span
                  aria-hidden
                  className="absolute inset-0 rounded-full border-[1.5px] border-foreground/10 border-t-foreground/55 motion-reduce:animate-none animate-spin"
                  style={{ animationDuration: "1.1s" }}
                />
              )}
              <CanderMark tone="color" className="!h-5 !w-5" />
            </div>
            {(envStatus === "error" || envStatus === "unavailable") &&
            onRetryEnv ? (
              <button
                type="button"
                onClick={onRetryEnv}
                className="mt-4 inline-flex h-9 items-center rounded-full bg-foreground px-4 text-[13px] font-medium text-background hover:opacity-90"
              >
                Retry
              </button>
            ) : null}
          </div>
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

      </div>
    </div>
  );
}
