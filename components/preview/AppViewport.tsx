"use client";

import { useApp } from "@/components/app/AppProvider";
import { BannerWash } from "@/components/spaces/BannerWash";
import { buildPreviews } from "@/lib/data";
import type { BannerKey } from "@/lib/space-banners";
import { cn } from "@/lib/utils";

/**
 * Calm project preview placeholder — no select-to-edit / localhost mock UI.
 * Real previews use published URLs (iframe) in ProjectBrowserPanel.
 */
export function AppViewport({
  name,
  summary,
}: {
  name: string;
  summary: string;
}) {
  const { viewport, previewKey, project, spaceId } = useApp();

  const framed = viewport !== "desktop";
  const cover =
    project?.cover ??
    buildPreviews.find((item) => item.projectId === project?.id)?.image;
  const washSpace: BannerKey =
    (project?.space as BannerKey | undefined) ??
    (spaceId as BannerKey | null) ??
    "build";

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
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-top"
          />
        ) : (
          <>
            <BannerWash space={washSpace} />
            <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center text-white">
              <p className="text-[1.5rem] font-semibold tracking-[-0.03em] md:text-[1.75rem]">
                {name}
              </p>
              <p className="mt-2 max-w-sm text-[13.5px] leading-relaxed text-white/75">
                {summary?.trim() ||
                  "Preview will show here when this project is published or running."}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
