"use client";

import { useSyncExternalStore } from "react";
import {
  bannerClass,
  bannerFor,
  getSpaceBannersServerSnapshot,
  getSpaceBannersSnapshot,
  subscribeSpaceBanners,
  type BannerKey,
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
    <>
      {choice.custom ? (
        <img
          src={choice.custom}
          alt=""
          className={cn(
            "absolute inset-0 h-full w-full object-cover",
            className,
          )}
        />
      ) : (
        <div
          className={cn("absolute inset-0", bannerClass(choice.preset), className)}
        />
      )}
      <div className="panel-grain" />
    </>
  );
}
