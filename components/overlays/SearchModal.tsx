"use client";

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import {
  Blocks,
  Compass,
  FileText,
  Globe,
  Hammer,
  History,
  LayoutDashboard,
  LayoutGrid,
  MessageSquarePlus,
  Palette,
  Search,
  Settings,
  Sparkles,
} from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { NativeOverlayGate } from "@/components/browser/NativeOverlayGate";
import { useCreateProjectFlow } from "@/components/spaces/use-create-project-flow";
import { Modal } from "@/components/ui/Modal";
import { connectors } from "@/lib/data";
import { canvasStartOptions } from "@/lib/canvas-start-options";
import { getChatThreads } from "@/lib/api/chat-store";
import {
  openIndexEntry,
  useSpaceIndex,
} from "@/lib/hooks/use-space-index";
import { QuerySkeleton } from "@/lib/hooks/space-query-ui";
import { SHOW_CONNECTORS_NAV } from "@/lib/spaces";
import { visibleSettingsTabs } from "@/lib/settings-nav";
import { cn } from "@/lib/utils";

type HitIcon = ComponentType<{ className?: string; strokeWidth?: number }>;

type Hit = {
  id: string;
  title: string;
  meta: string;
  group: string;
  icon?: HitIcon;
  run: () => void;
};

const SETTINGS_ICONS: Partial<Record<string, HitIcon>> = {
  appearance: Palette,
  usage: Sparkles,
  plans: LayoutDashboard,
  general: Settings,
};

export function SearchModal() {
  const {
    overlay,
    closeOverlay,
    workspaceId,
    openProject,
    openConnector,
    openThread,
    openRecents,
    openBrowser,
    openQuickSearchBrowser,
    standaloneBrowserOpen,
    newChat,
    browserPage,
    attachBrowserReference,
    openSpaceEntity,
    openSettings,
    openSpace,
    entitlements,
  } = useApp();
  const open = overlay === "search";
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const needle = query.trim();

  const { openCreate, modal: createModal } = useCreateProjectFlow((projectId) => {
    openProject(projectId, { landOnPanel: true });
  });

  const { entries, loading } = useSpaceIndex({
    query: needle.length >= 2 ? needle : undefined,
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setQuery("");
      setActive(0);
    });
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    const row = listRef.current?.querySelector<HTMLElement>(
      `[data-search-index="${active}"]`,
    );
    row?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const hits = useMemo(() => {
    const match = (value: string) =>
      !needle || value.toLowerCase().includes(needle.toLowerCase());
    const items: Hit[] = [];

    const push = (hit: Hit) => {
      if (!match(hit.title) && !match(hit.meta) && !match(hit.group)) return;
      items.push(hit);
    };

    if (standaloneBrowserOpen) {
      push({
        id: "action-current-tab",
        title: browserPage.title || "Current tab",
        meta: browserPage.url || "Attach this page to chat",
        group: "Create",
        icon: Globe,
        run: attachBrowserReference,
      });
    }

    push({
      id: "action-new-chat",
      title: "New chat",
      meta: "Start a conversation",
      group: "Create",
      icon: MessageSquarePlus,
      run: () => newChat(),
    });

    for (const option of canvasStartOptions()) {
      const Icon = option.icon;
      push({
        id: `action-create-${option.id}`,
        title: option.label,
        meta: option.summary,
        group: "Create",
        icon: Icon,
        run: () => {
          if (option.action === "quick-search") {
            openQuickSearchBrowser();
            return;
          }
          if (!option.space || !option.kind || !option.title) return;
          openCreate({
            space: option.space,
            kind: option.kind,
            defaultTitle: option.title,
            summary: option.summary,
          });
        },
      });
    }

    push({
      id: "nav-canvas",
      title: "Canvas",
      meta: "Projects and studio",
      group: "Navigate",
      icon: LayoutGrid,
      run: () => openSpace("studio"),
    });
    if (SHOW_CONNECTORS_NAV) {
      push({
        id: "nav-connectors",
        title: "Connectors",
        meta: "Connect your apps",
        group: "Navigate",
        icon: Blocks,
        run: () => openSpace("connectors"),
      });
    }
    push({
      id: "nav-recents",
      title: "Recents",
      meta: "Chats and projects you’ve opened",
      group: "Navigate",
      icon: History,
      run: openRecents,
    });
    push({
      id: "nav-browser",
      title: "Browser",
      meta: "Open the web",
      group: "Navigate",
      icon: Compass,
      run: () => openBrowser(),
    });

    // Settings shortcuts only when searching — keep the default list focused.
    if (needle) {
      for (const tab of visibleSettingsTabs(entitlements)) {
        push({
          id: `settings-${tab.id}`,
          title: tab.label,
          meta: "Settings",
          group: "Settings",
          icon: SETTINGS_ICONS[tab.id] ?? Settings,
          run: () => openSettings(tab.id),
        });
      }
    }

    if (!needle) return items;

    for (const entry of entries) {
      const group =
        entry.kind === "thread"
          ? "Chats"
          : entry.kind === "source"
            ? "Sources"
            : entry.kind === "briefing"
              ? "Work"
              : "Projects";
      items.push({
        id: `index-${entry.key}`,
        title: entry.title,
        meta: entry.meta,
        group,
        run: () =>
          openIndexEntry(entry, {
            openThread,
            openProject,
            openSpaceEntity,
          }),
      });
    }

    for (const connector of connectors) {
      if (!match(connector.name) && !match(connector.description)) continue;
      items.push({
        id: `conn-${connector.id}`,
        title: connector.name,
        meta: connector.category,
        group: "Connectors",
        icon: Blocks,
        run: () => openConnector(connector.id),
      });
    }
    for (const thread of getChatThreads().filter(
      (item) => item.workspaceId === workspaceId,
    )) {
      if (!match(thread.title) && !match(thread.snippet)) continue;
      items.push({
        id: `thread-${thread.id}`,
        title: thread.title,
        meta: thread.snippet,
        group: "Chats",
        icon: History,
        run: () => openThread(thread.id),
      });
    }
    return items;
  }, [
    needle,
    entries,
    workspaceId,
    openProject,
    openConnector,
    openThread,
    openRecents,
    openBrowser,
    openQuickSearchBrowser,
    standaloneBrowserOpen,
    newChat,
    browserPage,
    attachBrowserReference,
    openSpaceEntity,
    openSettings,
    openSpace,
    openCreate,
    entitlements,
  ]);

  const choose = (hit: Hit) => {
    hit.run();
    closeOverlay();
  };

  return (
    <>
      <NativeOverlayGate open={open} />
      <Modal
        open={open}
        onClose={closeOverlay}
        labelledBy="search-title"
        backdropClassName="bg-black/25"
        className="menu-glass-surface flex w-[min(40rem,calc(100vw-2rem))] flex-col overflow-hidden"
      >
        <div className="relative border-b border-foreground/[0.08] bg-transparent">
          <Search
            className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            strokeWidth={1.6}
          />
          <input
            ref={inputRef}
            id="search-title"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((n) => Math.min(hits.length - 1, n + 1));
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((n) => Math.max(0, n - 1));
              }
              if (event.key === "Enter" && hits[active]) {
                event.preventDefault();
                choose(hits[active]);
              }
            }}
            placeholder="Search chats, projects, and actions"
            className="h-12 w-full bg-transparent pr-4 pl-11 text-[15px] tracking-[-0.01em] outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div
          ref={listRef}
          className="max-h-[min(28rem,60vh)] overflow-y-auto px-2 py-2"
        >
          {loading && needle.length >= 2 ? (
            <QuerySkeleton rows={3} />
          ) : hits.length ? (
            hits.map((hit, index) => {
              const showGroup = hit.group !== hits[index - 1]?.group;
              const Icon = hit.icon ?? groupFallbackIcon(hit.group);
              const selected = index === active;
              return (
                <div key={hit.id}>
                  {showGroup ? (
                    <p className="px-2.5 pt-2.5 pb-1.5 font-mono text-[10px] tracking-[0.1em] text-muted-foreground/90 uppercase">
                      {hit.group}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    data-search-index={index}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => choose(hit)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-[10px] px-2 py-2 text-left transition-colors duration-150",
                      selected
                        ? "search-modal-row-active"
                        : "search-modal-row-hover",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]",
                        selected
                          ? "bg-foreground/[0.08] text-foreground"
                          : "bg-foreground/[0.04] text-muted-foreground",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" strokeWidth={1.7} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium tracking-[-0.02em]">
                        {hit.title}
                      </span>
                      <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                        {hit.meta}
                      </span>
                    </span>
                    {selected ? (
                      <kbd className="hidden shrink-0 rounded-md border border-foreground/10 bg-foreground/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
                        ↵
                      </kbd>
                    ) : null}
                  </button>
                </div>
              );
            })
          ) : (
            <p className="px-3 py-8 text-center text-[13px] text-muted-foreground">
              Nothing matches that search.
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 border-t border-foreground/[0.08] px-3.5 py-2.5 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            <span>Move</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>↵</Kbd>
            <span>Open</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>esc</Kbd>
            <span>Close</span>
          </span>
          <span className="ml-auto hidden font-mono tracking-wide sm:inline">
            ⌘K
          </span>
        </div>
      </Modal>
      {createModal}
    </>
  );
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex min-w-[1.25rem] items-center justify-center rounded-md border border-foreground/10 bg-foreground/[0.04] px-1 py-0.5 font-mono text-[10px] leading-none text-muted-foreground">
      {children}
    </kbd>
  );
}

function groupFallbackIcon(group: string): HitIcon {
  if (group === "Projects") return Hammer;
  if (group === "Sources" || group === "Files") return FileText;
  if (group === "Connectors") return Blocks;
  if (group === "Chats" || group === "Work") return History;
  if (group === "Navigate") return Compass;
  if (group === "Settings") return Settings;
  if (group === "Create") return MessageSquarePlus;
  return Search;
}
