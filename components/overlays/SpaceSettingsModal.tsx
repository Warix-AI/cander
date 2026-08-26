"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Search, X } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { Modal } from "@/components/ui/Modal";
import { BannerSettingsPanel } from "@/components/spaces/SpaceBanner";
import { WorkConnectorsSettings } from "@/components/spaces/WorkConnectorsSettings";
import { spaceSettings, type SpaceSettingsItem } from "@/lib/space-settings";
import { useMobileShell } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

const BACKGROUND_TAB = "background";

export function SpaceSettingsModal() {
  const {
    overlay,
    settingsSpaceId,
    settingsSpaceInitialTab,
    closeOverlay,
  } = useApp();
  const mobile = useMobileShell();
  const config = settingsSpaceId ? spaceSettings[settingsSpaceId] : null;
  const [tab, setTab] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    setTab(settingsSpaceInitialTab ?? BACKGROUND_TAB);
    setQuery("");
  }, [settingsSpaceId, config, settingsSpaceInitialTab]);

  const visible = useMemo(() => {
    if (!config) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return config.sections;
    return config.sections.filter(
      (section) =>
        section.label.toLowerCase().includes(needle) ||
        section.items.some(
          (item) =>
            item.name.toLowerCase().includes(needle) ||
            item.detail.toLowerCase().includes(needle),
        ),
    );
  }, [config, query]);

  const showBackground = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return ["background", "banner", "preset", "upload"].some((word) =>
      word.includes(needle) || needle.includes(word),
    );
  }, [query]);

  const section = config?.sections.find((item) => item.id === tab);

  const mobileTitle = useMemo(() => {
    if (tab === BACKGROUND_TAB) return "Background";
    if (tab === "connectors" && settingsSpaceId === "work") return "Connectors";
    return section?.label ?? config?.title ?? "Settings";
  }, [tab, section, settingsSpaceId, config]);

  const panel = (
    <>
      {tab === BACKGROUND_TAB && settingsSpaceId ? (
        <BannerSettingsPanel space={settingsSpaceId} />
      ) : tab === "connectors" && settingsSpaceId === "work" ? (
        <WorkConnectorsSettings compact={mobile} />
      ) : section ? (
        <>
          {!mobile ? (
            <>
              <h2
                id="space-settings-title"
                className="text-[18px] font-semibold tracking-[-0.03em]"
              >
                {section.label}
              </h2>
              <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-muted-foreground">
                {section.description}
              </p>
              <p className="mt-1 max-w-xl text-[12.5px] text-muted-foreground/80">
                {config?.subtitle}
              </p>
            </>
          ) : null}
          <div
            className={cn(
              "grid gap-3",
              mobile ? "mt-0" : "mt-6",
              section.items.some((item) => item.preview === "theme")
                ? "sm:grid-cols-2"
                : "sm:grid-cols-2 lg:grid-cols-2",
            )}
          >
            {section.items.map((item) => (
              <SettingsCard key={item.id} item={item} compact={mobile} />
            ))}
          </div>
        </>
      ) : null}
    </>
  );

  return (
    <Modal
      open={overlay === "space-settings" && !!config}
      onClose={closeOverlay}
      labelledBy="space-settings-title"
      edgeToEdge={mobile}
      className={cn(
        mobile
          ? "flex h-[100dvh] w-full flex-col"
          : "flex h-[min(52rem,calc(100vh-3rem))] w-[min(58rem,calc(100vw-2rem))]",
      )}
    >
      {config ? (
        mobile ? (
          <>
            <header className="flex shrink-0 items-center gap-2 border-b border-border px-2 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
              <button
                type="button"
                aria-label="Close"
                onClick={closeOverlay}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted"
              >
                <ChevronLeft className="h-5 w-5" strokeWidth={1.8} />
              </button>
              <h2
                id="space-settings-title"
                className="min-w-0 flex-1 truncate text-center text-[15px] font-medium tracking-[-0.01em]"
              >
                {mobileTitle}
              </h2>
              <span className="inline-flex h-11 w-11 shrink-0" aria-hidden />
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {panel}
            </div>
          </>
        ) : (
          <>
            <nav className="flex w-[14rem] shrink-0 flex-col border-r border-border bg-muted/40 p-3">
              <div className="px-1 pb-2">
                <p className="text-[11px] tracking-[0.06em] text-muted-foreground uppercase">
                  Library
                </p>
                <p className="mt-1 text-[14px] font-medium tracking-[-0.02em]">
                  {config.title}
                </p>
              </div>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                  strokeWidth={1.6}
                />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search"
                  className="h-9 w-full rounded-[10px] border border-border bg-background pr-3 pl-8 text-[13px] outline-none placeholder:text-muted-foreground focus:border-foreground/20"
                />
              </div>
              <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
                {showBackground ? (
                  <button
                    type="button"
                    onClick={() => setTab(BACKGROUND_TAB)}
                    className={cn(
                      "flex w-full rounded-[10px] px-2.5 py-2 text-left text-[13.5px] transition-colors duration-200",
                      tab === BACKGROUND_TAB ? "bg-muted font-medium" : "hover:bg-muted",
                    )}
                  >
                    Background
                  </button>
                ) : null}
                {visible.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTab(item.id)}
                    className={cn(
                      "flex w-full rounded-[10px] px-2.5 py-2 text-left text-[13.5px] transition-colors duration-200",
                      tab === item.id ? "bg-muted font-medium" : "hover:bg-muted",
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </nav>

            <div className="relative min-w-0 flex-1 overflow-y-auto px-8 py-7">
              <button
                type="button"
                aria-label="Close space settings"
                onClick={closeOverlay}
                className="absolute top-4 right-4 inline-flex h-8 w-8 items-center justify-center rounded-[10px] text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" strokeWidth={1.6} />
              </button>
              {panel}
            </div>
          </>
        )
      ) : null}
    </Modal>
  );
}

function SettingsCard({
  item,
  compact = false,
}: {
  item: SpaceSettingsItem;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        "group overflow-hidden border text-left transition-all duration-200 hover:border-foreground/20 hover:shadow-sm",
        compact ? "rounded-[12px]" : "rounded-[10px]",
        item.active ? "border-foreground/20 ring-1 ring-foreground/10" : "border-border",
      )}
    >
      {!compact ? <SettingsPreview item={item} /> : null}
      <div className={cn("bg-card", compact ? "px-4 py-3.5" : "px-3.5 py-3")}>
        <div className="flex items-start justify-between gap-2">
          <p className={cn(
            "font-medium tracking-[-0.02em]",
            compact ? "text-[15px]" : "text-[14px]",
          )}>
            {item.name}
          </p>
          {item.active ? (
            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              Default
            </span>
          ) : null}
        </div>
        <p className={cn(
          "mt-1 leading-relaxed text-muted-foreground",
          compact ? "text-[13px]" : "text-[12.5px]",
        )}>
          {item.detail}
        </p>
        {item.tags?.length ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {item.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </button>
  );
}

function SettingsPreview({ item }: { item: SpaceSettingsItem }) {
  if (item.preview === "theme" && item.themeClass) {
    return (
      <div className={cn("relative h-32 overflow-hidden", item.themeClass)}>
        <div className="grain-layer opacity-60" />
        <div className="absolute top-3 right-3 h-14 w-[4.5rem] rounded-[6px] border border-white/30 bg-white/90 shadow-sm" />
        <div className="absolute bottom-3 left-3 flex items-center gap-2">
          <ColorStack colors={item.colors ?? []} />
          <div className="h-1.5 w-16 rounded-full bg-white/40" />
        </div>
        <div className="absolute top-3 left-3 h-2 w-10 rounded-full bg-white/35" />
      </div>
    );
  }

  if (item.preview === "template" && item.image) {
    return (
      <div className="relative h-32 overflow-hidden bg-muted">
        <img
          src={item.image}
          alt=""
          className="h-full w-full object-cover object-top"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />
        <div className="absolute bottom-3 left-3">
          <ColorStack colors={item.colors ?? ["#FFFFFF", "#6B9FFF"]} />
        </div>
      </div>
    );
  }

  if (item.preview === "component") {
    const [a = "#6366F1", b = "#E2E8F0"] = item.colors ?? [];
    return (
      <div className="relative h-32 overflow-hidden bg-muted/40 p-4">
        <div
          className="absolute inset-x-4 top-4 h-3 rounded-full opacity-90"
          style={{ background: a }}
        />
        <div className="absolute inset-x-4 top-10 space-y-2">
          <div className="h-2 w-[88%] rounded-full bg-foreground/10" />
          <div className="h-2 w-[72%] rounded-full bg-foreground/10" />
          <div className="h-2 w-[56%] rounded-full bg-foreground/10" />
        </div>
        <div
          className="absolute bottom-4 left-4 h-8 w-20 rounded-[6px]"
          style={{ background: b }}
        />
        <div
          className="absolute right-4 bottom-4 h-8 w-8 rounded-full"
          style={{ background: a }}
        />
        <ColorStack
          colors={item.colors ?? []}
          className="absolute bottom-4 left-1/2 -translate-x-1/2"
        />
      </div>
    );
  }

  return (
    <div className="relative flex h-32 items-center justify-center overflow-hidden bg-muted/30">
      <ColorStack colors={item.colors ?? ["#64748B", "#CBD5E1", "#F1F5F9"]} />
    </div>
  );
}

function ColorStack({
  colors,
  className,
}: {
  colors: string[];
  className?: string;
}) {
  if (!colors.length) return null;
  return (
    <div className={cn("flex -space-x-2", className)}>
      {colors.map((color) => (
        <span
          key={color}
          className="h-6 w-6 rounded-full border-2 border-white shadow-sm"
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}
