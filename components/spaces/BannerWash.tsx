"use client";

import { useSyncExternalStore } from "react";
import {
  bannerClass,
  bannerFor,
  DEFAULT_CHAT_PREVIEW_PRESET,
  getSpaceBannersServerSnapshot,
  getSpaceBannersSnapshot,
  subscribeSpaceBanners,
  type BannerKey,
  type BannerPresetId,
} from "@/lib/space-banners";
import { cn } from "@/lib/utils";

export function useBannerChoice(space: BannerKey) {
  const banners = useSyncExternalStore(
    subscribeSpaceBanners,
    getSpaceBannersSnapshot,
    getSpaceBannersServerSnapshot,
  );
  return bannerFor(space, banners);
}

function BannerWashLayers({
  preset,
  custom,
  className,
}: {
  preset: BannerPresetId;
  custom?: string | null;
  className?: string;
}) {
  return (
    <>
      {custom ? (
        <img
          src={custom}
          alt=""
          className={cn(
            "absolute inset-0 h-full w-full object-cover",
            className,
          )}
        />
      ) : (
        <div
          className={cn("absolute inset-0", bannerClass(preset), className)}
        />
      )}
      <div className="panel-grain" />
    </>
  );
}

/** Fills a relative parent with the space banner wash (or custom image). */
export function BannerWash({
  space,
  className,
}: {
  space: BannerKey;
  className?: string;
}) {
  const choice = useBannerChoice(space);
  return (
    <BannerWashLayers
      preset={choice.preset}
      custom={choice.custom}
      className={className}
    />
  );
}

/** Unified orange chat thumbnail wash when no cover image is available. */
export function DefaultChatPreviewWash({ className }: { className?: string }) {
  return (
    <BannerWashLayers
      preset={DEFAULT_CHAT_PREVIEW_PRESET}
      className={className}
    />
  );
}
