"use client";

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import {
  Compass,
  FileText,
  Globe,
  Hammer,
  History,
  Layers,
  LayoutDashboard,
  LayoutGrid,
  MessageSquarePlus,
  Palette,
  Search,
  Settings,
  Sparkles,
} from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { useCreateProjectFlow } from "@/components/spaces/use-create-project-flow";
import {
  SettingsGroup,
  SettingsHeader,
  SettingsPage,
  SettingsSection,
  settingsInputClass,
} from "@/components/settings/SettingsChrome";
import { connectors } from "@/lib/data";
import { canvasStartOptions } from "@/lib/canvas-start-options";
import { getChatThreads } from "@/lib/api/chat-store";
import {
  openIndexEntry,
  useSpaceIndex,
} from "@/lib/hooks/use-space-index";
import { QuerySkeleton } from "@/lib/hooks/space-query-ui";
import { SHOW_CONNECTORS_NAV } from "@/lib/spaces";
import { setAppsMoreOpen } from "@/lib/apps-more-prefs";
import { requestConnectorsCatalog } from "@/lib/connector-connect-intent";
import { visibleSettingsTabs } from "@/lib/settings-nav";
import { SHELL_G3_RADIUS } from "@/lib/shell-chrome";
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

/**
 * Dedicated search surface — same actions as the old command palette,
 * laid out like Notifications / Help.
 */
export function SearchView() {
  const {
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
    enabled: true,
  });

  useEffect(() => {
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, []);

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
          if (option.disabled) return;
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
        title: "Apps",
        meta: "Connect your apps",
        group: "Navigate",
        icon: Layers,
        run: () => {
          setAppsMoreOpen(false);
          requestConnectorsCatalog();
          openSpace("connectors");
        },
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
        group: "Apps",
        icon: Layers,
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
  };

  return (
    <>
      <SettingsPage>
        <SettingsHeader
          kicker="Find"
          title="Search"
          subtitle="Jump to chats, apps, projects, and actions."
        />

        <SettingsSection className="mt-2 lg:mt-6">
          <div className="relative mb-3">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              strokeWidth={1.6}
            />
            <input
              ref={inputRef}
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
                  choose(hits[active]!);
                }
              }}
              placeholder="Search chats, projects, and actions"
              className={cn(settingsInputClass, "h-11 pl-10 text-[14px]")}
              aria-label="Search"
            />
          </div>

          <SettingsGroup>
            <div ref={listRef} className="min-h-[12rem]">
              {loading && needle.length >= 2 ? (
                <div className="px-1 py-2">
                  <QuerySkeleton rows={3} />
                </div>
              ) : hits.length ? (
                hits.map((hit, index) => {
                  const showGroup = hit.group !== hits[index - 1]?.group;
                  const Icon = hit.icon ?? groupFallbackIcon(hit.group);
                  const selected = index === active;
                  return (
                    <div key={hit.id}>
                      {showGroup ? (
                        <p className="px-1 pt-3 pb-1.5 font-mono text-[10px] tracking-[0.1em] text-muted-foreground/90 uppercase first:pt-1">
                          {hit.group}
                        </p>
                      ) : null}
                      <button
                        type="button"
                        data-search-index={index}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => choose(hit)}
                        className={cn(
                          "flex w-full items-center gap-3 px-1 py-2.5 text-left transition-colors duration-150",
                          SHELL_G3_RADIUS,
                          selected
                            ? "bg-muted/60"
                            : "hover:bg-muted/40",
                        )}
                      >
                        <span
                          className={cn(
                            "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]",
                            selected
                              ? "bg-foreground/[0.08] text-foreground"
                              : "bg-muted/70 text-muted-foreground",
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" strokeWidth={1.7} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-medium tracking-[-0.01em]">
                            {hit.title}
                          </span>
                          <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
                            {hit.meta}
                          </span>
                        </span>
                      </button>
                    </div>
                  );
                })
              ) : (
                <p className="px-1 py-8 text-[13px] text-muted-foreground">
                  Nothing matches that search.
                </p>
              )}
            </div>
          </SettingsGroup>
        </SettingsSection>
      </SettingsPage>
      {createModal}
    </>
  );
}

function groupFallbackIcon(group: string): HitIcon {
  if (group === "Projects") return Hammer;
  if (group === "Sources" || group === "Files") return FileText;
  if (group === "Apps") return Layers;
  if (group === "Chats" || group === "Work") return History;
  if (group === "Navigate") return Compass;
  if (group === "Settings") return Settings;
  if (group === "Create") return MessageSquarePlus;
  return Search;
}
