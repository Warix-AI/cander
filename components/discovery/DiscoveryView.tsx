"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { Search, X } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { DiscoveryIcon } from "@/components/discovery/DiscoveryIcon";
import { NavToggle } from "@/components/shell/NavToggle";
import {
  subscribeInstalledConnectors,
  getInstalledConnectorsSnapshot,
  getInstalledConnectorsServerSnapshot,
} from "@/lib/connector-install";
import { discoveryBannerKey } from "@/lib/discovery-banner";
import {
  getDiscoveryServerSnapshot,
  getDiscoverySnapshot,
  itemsForSection,
  markDiscoveryOpened,
  markDiscoveryTried,
  searchDiscovery,
  subscribeDiscovery,
} from "@/lib/discovery-store";
import type { DiscoveryItem, DiscoverySection } from "@/lib/discovery-types";
import {
  bannerClass,
  bannerFor,
  getSpaceBannersServerSnapshot,
  getSpaceBannersSnapshot,
  subscribeSpaceBanners,
} from "@/lib/space-banners";
import { cn } from "@/lib/utils";

const EMPTY_VISITED: [] = [];

const SECTIONS: {
  id: DiscoverySection;
  title: string;
  blurb: string;
}[] = [
  {
    id: "recommended",
    title: "Recommended for you",
    blurb: "Capabilities you haven’t used yet.",
  },
  {
    id: "get-things-done",
    title: "Get things done",
    blurb: "Outcomes you can ask Courier for.",
  },
  {
    id: "connect",
    title: "Connect your apps",
    blurb: "Unlock inbox, calendar, chat, and more.",
  },
  {
    id: "automate",
    title: "Automate your work",
    blurb: "Recurring jobs and scheduled help.",
  },
  {
    id: "explore",
    title: "Explore Courier",
    blurb: "Spaces and surfaces across the product.",
  },
  {
    id: "private-ai",
    title: "Private AI",
    blurb: "Local hosting, on-device models, and private knowledge.",
  },
];

export function DiscoveryView() {
  const {
    billingPlan,
    entitlements,
    product,
    openDiscoveryItem,
    runDiscoveryAction,
    sidebarOpen,
    mobileNav,
    newChat,
  } = useApp();
  const [query, setQuery] = useState("");
  const store = useSyncExternalStore(
    subscribeDiscovery,
    getDiscoverySnapshot,
    getDiscoveryServerSnapshot,
  );
  const installed = useSyncExternalStore(
    subscribeInstalledConnectors,
    getInstalledConnectorsSnapshot,
    getInstalledConnectorsServerSnapshot,
  );
  const banners = useSyncExternalStore(
    subscribeSpaceBanners,
    getSpaceBannersSnapshot,
    getSpaceBannersServerSnapshot,
  );

  const ctx = useMemo(
    () => ({
      billingPlan,
      installedConnectors: installed,
      visitedSpaces: EMPTY_VISITED,
      product,
      platformNavAllowed: entitlements.platformNavAllowed,
    }),
    [billingPlan, entitlements.platformNavAllowed, installed, product],
  );

  const searched = useMemo(() => {
    void store;
    return searchDiscovery(query, ctx);
  }, [ctx, query, store]);

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <header className="flex h-11 shrink-0 items-center gap-1 bg-background px-2">
        <NavToggle
          className={cn(
            sidebarOpen && "lg:hidden",
            mobileNav && "max-lg:hidden",
          )}
        />
        <button
          type="button"
          aria-label="Close discovery"
          onClick={() => newChat()}
          className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" strokeWidth={1.6} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8">
        <div className="mx-auto w-full max-w-3xl">
          <h1 className="text-[28px] font-semibold tracking-[-0.04em] sm:text-[32px]">
            Discover Courier
          </h1>
          <p className="mt-1.5 text-[14.5px] text-muted-foreground">
            Things you can do with Courier
          </p>

          <label className="relative mt-6 block">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              strokeWidth={1.6}
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="What do you want to do?"
              className="h-11 w-full rounded-[10px] border border-border bg-card pr-3 pl-10 text-[14px] outline-none focus:border-foreground/20"
            />
          </label>

          {query.trim() ? (
            <div className="mt-8">
              <SectionHeading title="Results" blurb={`${searched.length} matches`} />
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {searched.map((item) => (
                  <DiscoveryCard
                    key={item.id}
                    item={item}
                    banners={banners}
                    onOpen={() => {
                      markDiscoveryOpened(item.id);
                      openDiscoveryItem(item.id);
                    }}
                    onCta={() => {
                      markDiscoveryTried(item.id);
                      runDiscoveryAction(item.cta, item);
                    }}
                  />
                ))}
              </div>
              {!searched.length ? (
                <p className="mt-6 text-[13.5px] text-muted-foreground">
                  Nothing matched. Try “meetings”, “email”, or “build”.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="mt-10 space-y-10">
              {SECTIONS.map((section) => {
                const items = itemsForSection(section.id, ctx).slice(0, 6);
                if (!items.length) return null;
                return (
                  <div key={section.id}>
                    <SectionHeading title={section.title} blurb={section.blurb} />
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {items.map((item) => (
                        <DiscoveryCard
                          key={item.id}
                          item={item}
                          banners={banners}
                          onOpen={() => {
                            markDiscoveryOpened(item.id);
                            openDiscoveryItem(item.id);
                          }}
                          onCta={() => {
                            markDiscoveryTried(item.id);
                            runDiscoveryAction(item.cta, item);
                          }}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function SectionHeading({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div>
      <h2 className="text-[16px] font-semibold tracking-[-0.02em]">{title}</h2>
      <p className="mt-0.5 text-[13px] text-muted-foreground">{blurb}</p>
    </div>
  );
}

function DiscoveryCard({
  item,
  banners,
  onOpen,
  onCta,
}: {
  item: DiscoveryItem;
  banners: ReturnType<typeof getSpaceBannersSnapshot>;
  onOpen: () => void;
  onCta: () => void;
}) {
  const spaceKey = discoveryBannerKey(item);
  const choice = spaceKey ? bannerFor(spaceKey, banners) : null;
  const washed = Boolean(choice);

  return (
    <article
      className={cn(
        "relative flex flex-col overflow-hidden rounded-[10px] border p-4",
        washed ? "border-transparent text-white" : "border-border bg-card",
      )}
    >
      {choice ? (
        <>
          {choice.custom ? (
            // eslint-disable-next-line @next/next/no-img-element
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
          <div className="panel-grain absolute inset-0 opacity-40" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/25 to-black/10" />
        </>
      ) : null}

      <button
        type="button"
        onClick={onOpen}
        className="relative z-10 flex flex-1 items-start gap-3 text-left"
      >
        <DiscoveryIcon item={item} />
        <span className="min-w-0">
          {item.badge ? (
            <span
              className={cn(
                "mb-1 block text-[11px] font-medium tracking-[0.04em] uppercase",
                washed ? "text-white/70" : "text-muted-foreground",
              )}
            >
              {item.badge}
            </span>
          ) : null}
          <span className="block text-[14px] font-medium tracking-[-0.02em]">
            {item.title}
          </span>
          <span
            className={cn(
              "mt-1 block text-[12.5px] leading-snug",
              washed ? "text-white/80" : "text-muted-foreground",
            )}
          >
            {item.description}
          </span>
        </span>
      </button>
      <div className="relative z-10 mt-3 flex justify-end">
        <button
          type="button"
          onClick={onCta}
          className={cn(
            "inline-flex h-8 items-center rounded-full px-3 text-[12.5px] font-medium",
            washed
              ? "bg-white text-black hover:bg-white/90"
              : "bg-primary text-primary-foreground",
          )}
        >
          {item.cta.label}
        </button>
      </div>
    </article>
  );
}
