"use client";

import { useRef, useSyncExternalStore } from "react";
import { ImagePlus } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { NavToggle } from "@/components/shell/NavToggle";
import {
  BANNER_PRESETS,
  bannerClass,
  bannerFor,
  getSpaceBannersServerSnapshot,
  getSpaceBannersSnapshot,
  setBannerCustom,
  setBannerPreset,
  subscribeSpaceBanners,
  type BannerKey,
} from "@/lib/space-banners";
import { cn } from "@/lib/utils";

export function SpaceBanner({
  space,
  children,
}: {
  space: BannerKey;
  children: React.ReactNode;
}) {
  const { sidebarOpen, mobileNav } = useApp();
  const banners = useSyncExternalStore(
    subscribeSpaceBanners,
    getSpaceBannersSnapshot,
    getSpaceBannersServerSnapshot,
  );
  const choice = bannerFor(space, banners);

  return (
    <div className="relative h-40 shrink-0">
      <div className="absolute inset-0 overflow-hidden">
        {choice.custom ? (
          <img
            src={choice.custom}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div
            className={cn("absolute inset-0", bannerClass(choice.preset))}
          />
        )}
        <div className="panel-grain" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-black/15 to-transparent" />
      </div>
      <NavToggle
        onBanner
        className={cn(
          "absolute top-1.5 left-2 z-20",
          sidebarOpen && "lg:hidden",
          mobileNav && "max-lg:hidden",
        )}
      />
      <div className="relative z-10 h-full">{children}</div>
    </div>
  );
}

function useSpaceBanner(space: BannerKey) {
  const banners = useSyncExternalStore(
    subscribeSpaceBanners,
    getSpaceBannersSnapshot,
    getSpaceBannersServerSnapshot,
  );
  return bannerFor(space, banners);
}

function BannerUploadInput({
  space,
  inputRef,
}: {
  space: BannerKey;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === "string") {
            setBannerCustom(space, reader.result);
          }
        };
        reader.readAsDataURL(file);
      }}
    />
  );
}

function BannerOptions({
  space,
  compact = false,
  onPick,
  onUpload,
}: {
  space: BannerKey;
  compact?: boolean;
  onPick?: () => void;
  onUpload: () => void;
}) {
  const choice = useSpaceBanner(space);

  return (
    <>
      <div className={cn("grid gap-1.5", compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4")}>
        {BANNER_PRESETS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setBannerPreset(space, item.id);
              onPick?.();
            }}
            className={cn(
              "overflow-hidden rounded-[10px] border text-left transition-colors duration-200",
              !choice.custom && choice.preset === item.id
                ? "border-foreground/30 ring-1 ring-foreground/15"
                : "border-border hover:border-foreground/20",
            )}
          >
            <span className={cn("relative block", compact ? "h-10" : "h-16", item.className)}>
              <span className="panel-grain" />
            </span>
            <span className="block px-2 py-1.5 text-[11.5px] font-medium">
              {item.label}
            </span>
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onUpload}
        className={cn(
          "mt-2 flex w-full items-center gap-2 rounded-[10px] px-2 py-2 text-left text-[13px] hover:bg-muted",
          choice.custom && "bg-muted font-medium",
        )}
      >
        <ImagePlus
          className="h-3.5 w-3.5 text-muted-foreground"
          strokeWidth={1.6}
        />
        Upload custom
      </button>
    </>
  );
}

export function BannerSettingsPanel({ space }: { space: BannerKey }) {
  const choice = useSpaceBanner(space);
  const input = useRef<HTMLInputElement>(null);

  return (
    <div>
      <BannerUploadInput space={space} inputRef={input} />
      <h2
        id="space-settings-title"
        className="text-[18px] font-semibold tracking-[-0.03em]"
      >
        Background
      </h2>
      <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-muted-foreground">
        The banner at the top of this space. Pick a preset or upload an image.
      </p>
      <div className="relative mt-6 h-36 overflow-hidden rounded-[10px] border border-border">
        {choice.custom ? (
          <img
            src={choice.custom}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className={cn("absolute inset-0", bannerClass(choice.preset))} />
        )}
        <div className="panel-grain" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-black/15 to-transparent" />
      </div>
      <div className="mt-4">
        <BannerOptions
          space={space}
          onUpload={() => input.current?.click()}
        />
      </div>
    </div>
  );
}
