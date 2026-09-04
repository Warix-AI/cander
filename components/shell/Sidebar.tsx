"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  ArrowLeft,
  Building2,
  ChartNoAxesColumn,
  CreditCard,
  FolderKanban,
  GripVertical,
  LayoutGrid,
  MessageSquare,
  Palette,
  SquarePen,
  UserRound,
} from "lucide-react";
import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import { AccountMenu } from "@/components/shell/AccountMenu";
import { PinControl } from "@/components/shell/PinControl";
import { PinnedFilterMenu } from "@/components/shell/PinnedFilterMenu";
import { WindowChrome } from "@/components/shell/WindowChrome";
import { LeftNavToggleDock } from "@/components/shell/NavToggle";
import { WorkspaceRail } from "@/components/shell/WorkspaceRail";
import { useApp } from "@/components/app/AppProvider";
import { visibleSettingsTabs } from "@/lib/settings-nav";
import { workspacesFor } from "@/lib/entitlements";
import {
  organizePinnedItems,
  usePinDisplayPrefs,
} from "@/lib/pin-display-prefs";
import { spaceIcons, spaceIconTint } from "@/lib/space-icons";
import { type SidebarNavId, isExtraNavId, isComingSoonNav, navSpaceMatches } from "@/lib/spaces";
import {
  setSidebarPeeking,
  subscribeSidebarPeekHold,
  subscribeSidebarPeekRelease,
} from "@/lib/sidebar-peek";
import { useMainNavItems } from "@/lib/use-main-nav-items";
import { usePinnedItems, type PinnedItem } from "@/lib/use-pinned-items";
import {
  getWorkspaceCatalogServerSnapshot,
  getWorkspaceCatalogSnapshot,
  subscribeWorkspaceCatalog,
} from "@/lib/workspace-catalog";
import type { PinKind, SettingsTab, SpaceId } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useDesktopShell } from "@/lib/desktop-shell";
import { SHELL_G3_RADIUS, useShellStyle } from "@/lib/shell-chrome";

const PEEK_CLOSE_MS = 160;
const PEEK_EXIT_MS = 420;

const settingsIcons: Record<SettingsTab, typeof Building2> = {
  organization: Building2,
  workspaces: LayoutGrid,
  plans: CreditCard,
  usage: ChartNoAxesColumn,
  general: UserRound,
  appearance: Palette,
};

export function Sidebar() {
  const {
    view,
    spaceId,
    threadId,
    projectId,
    sidebarOpen,
    newChat,
    openSpace,
    openRecents,
    openBrowser,
    reorderPins,
    openThread,
    openProject,
    openConnector,
    connectorId,
    entitlements,
    actor,
    settingsTab,
    setSettingsTab,
    workspaceRailOpen,
    canGoBack,
    goBack,
  } = useApp();

  const mainNavItems = useMainNavItems({ spacesOnly: true });
  const { pinnedItems } = usePinnedItems();
  const { prefs: pinPrefs } = usePinDisplayPrefs();
  useSyncExternalStore(
    subscribeWorkspaceCatalog,
    getWorkspaceCatalogSnapshot,
    getWorkspaceCatalogServerSnapshot,
  );
  const inSettings = view === "settings";
  const [peek, setPeek] = useState(false);
  const [peekVisible, setPeekVisible] = useState(false);
  const peekCloseTimer = useRef<number | null>(null);
  const peekExitTimer = useRef<number | null>(null);
  const edgeRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (sidebarOpen) {
      queueMicrotask(() => {
        setPeek(false);
        setPeekVisible(false);
      });
    }
  }, [sidebarOpen]);

  useEffect(() => {
    return () => {
      if (peekCloseTimer.current) window.clearTimeout(peekCloseTimer.current);
      if (peekExitTimer.current) window.clearTimeout(peekExitTimer.current);
      setSidebarPeeking(false);
    };
  }, []);

  const peeking = peek && !sidebarOpen;

  useEffect(() => {
    setSidebarPeeking(peeking);
  }, [peeking]);

  const clearPeekClose = useCallback(() => {
    if (peekCloseTimer.current) {
      window.clearTimeout(peekCloseTimer.current);
      peekCloseTimer.current = null;
    }
  }, []);

  const clearPeekExit = useCallback(() => {
    if (peekExitTimer.current) {
      window.clearTimeout(peekExitTimer.current);
      peekExitTimer.current = null;
    }
  }, []);

  const openPeek = useCallback(() => {
    if (sidebarOpen) return;
    clearPeekClose();
    clearPeekExit();
    setPeek(true);
    setPeekVisible(true);
  }, [sidebarOpen, clearPeekClose, clearPeekExit]);

  const scheduleClosePeek = useCallback(() => {
    if (sidebarOpen) return;
    clearPeekClose();
    peekCloseTimer.current = window.setTimeout(() => {
      peekCloseTimer.current = null;
      if (
        panelRef.current?.matches(":hover") ||
        edgeRef.current?.matches(":hover") ||
        document.querySelector("[data-sidebar-flyout]:hover")
      ) {
        return;
      }
      setPeek(false);
      clearPeekExit();
      peekExitTimer.current = window.setTimeout(() => {
        peekExitTimer.current = null;
        setPeekVisible(false);
      }, PEEK_EXIT_MS);
    }, PEEK_CLOSE_MS);
  }, [sidebarOpen, clearPeekClose, clearPeekExit]);

  useEffect(() => {
    return subscribeSidebarPeekHold(() => {
      if (sidebarOpen) return;
      clearPeekClose();
      clearPeekExit();
      setPeek(true);
      setPeekVisible(true);
    });
  }, [sidebarOpen, clearPeekClose, clearPeekExit]);

  useEffect(() => {
    return subscribeSidebarPeekRelease(scheduleClosePeek);
  }, [scheduleClosePeek]);

  const shellStyle = useShellStyle();
  const floating = shellStyle === "floating";
  const desktop = useDesktopShell();
  /**
   * Desktop (classic + floating): panel toggle / search / history live on the
   * traffic-light row, outside the menu body. Menu content starts at New Chat.
   * Web floating: same idea — chrome above the floating card, not inside it.
   */
  const macDesktop = desktop;
  const chromeOutside = desktop || floating;
  const workspaceCount = workspacesFor(actor, entitlements).length;
  const showRail =
    entitlements.hasWorkspaces &&
    !entitlements.showInviteWall &&
    workspaceRailOpen &&
    workspaceCount >= 2;

  const settingsNav = visibleSettingsTabs(entitlements);
  const chatActive = view === "chat" && !threadId && !spaceId;

  const activePinnedProject =
    Boolean(projectId) &&
    pinnedItems.some(
      (item) => item.kind === "project" && item.id === projectId,
    );

  const navActive = (id: SidebarNavId) => {
    if (id === "recents") return view === "recents";
    // Pinned connector detail — highlight the pin, not the Connectors tab.
    if (id === "connectors" && connectorId) return false;
    // Pinned project — highlight the pin row, not the space.
    if (activePinnedProject && (id === spaceId || (id === "studio" && spaceId === "build")))
      return false;
    return (
      navSpaceMatches(id, spaceId) && (view === "space" || view === "chat")
    );
  };

  const visiblePins = useMemo(
    () => organizePinnedItems(pinnedItems, pinPrefs),
    [pinnedItems, pinPrefs],
  );

  const pinRowActive = (item: PinnedItem) => {
    if (item.kind === "thread") return threadId === item.id;
    if (item.kind === "connector")
      return connectorId === item.id && spaceId === "connectors";
    // openProject always sets threadId — still highlight the pin by project.
    return projectId === item.id;
  };

  const openNav = (id: SidebarNavId) => {
    if (isComingSoonNav(id)) return;
    if (id === "browser") openBrowser();
    else if (id === "recents") openRecents();
    else openSpace(id);
  };

  const renderPinnedRow = (item: PinnedItem) => (
    <PinnedRow
      key={`${item.kind}-${item.id}`}
      kind={item.kind}
      id={item.id}
      title={item.title}
      leading={<PinnedLeading item={item} />}
      active={pinRowActive(item)}
      onOpen={() => {
        if (item.kind === "thread") openThread(item.id);
        else if (item.kind === "connector") openConnector(item.id);
        else openProject(item.id);
      }}
      onReorder={reorderPins}
    />
  );

  return (
    <>
      <LeftNavToggleDock showRail={showRail} peeking={peeking} />
      {!sidebarOpen ? (
        <div
          ref={edgeRef}
          aria-hidden
          data-sidebar-edge=""
          className="fixed inset-y-0 left-0 z-30 hidden w-[15px] lg:block"
          onMouseEnter={openPeek}
          onMouseLeave={scheduleClosePeek}
        />
      ) : null}
      <div
        ref={panelRef}
        data-sidebar-panel=""
        onMouseEnter={!sidebarOpen ? openPeek : undefined}
        onMouseLeave={!sidebarOpen ? scheduleClosePeek : undefined}
        className={cn(
          "hidden h-full max-w-[100vw] shrink-0 gap-0 lg:flex",
          chromeOutside && "flex-col",
          sidebarOpen
            ? "lg:static lg:max-w-none"
            : cn(
                "lg:fixed lg:inset-y-0 lg:left-0 lg:z-40",
                "will-change-transform transition-[transform,opacity]",
                peek
                  ? "translate-x-0 opacity-100 duration-[360ms] ease-out"
                  : "pointer-events-none -translate-x-full opacity-0 duration-[420ms] ease-in",
                !peekVisible && "invisible",
              ),
        )}
        aria-hidden={!sidebarOpen && !peek}
      >
      {macDesktop ? (
        <WindowChrome
          clearTrafficLights
          hideHistory={peeking}
          className={cn(
            "w-full",
            floating
              ? "bg-transparent text-foreground"
              : "bg-sidebar text-sidebar-foreground",
          )}
        />
      ) : null}

      <div
        className={cn(
          "flex min-h-0",
          chromeOutside ? "flex-1" : "h-full",
          floating && "mb-3 mr-2",
          floating && !macDesktop && "mt-0",
        )}
      >
      <WorkspaceRail />
      <aside
        className={cn(
          "flex w-[min(244px,calc(100vw-3.5rem))] shrink-0 flex-col bg-sidebar text-sidebar-foreground lg:w-[244px]",
          floating
            ? cn(
                "light-surface overflow-hidden",
                SHELL_G3_RADIUS,
                chromeOutside
                  ? // Chrome already owns the top row; panel sits under it.
                    cn("h-full", !showRail && "ml-3")
                  : cn(
                      "mb-3 mr-2 mt-[max(0.75rem,var(--desktop-titlebar))] h-[calc(100%-0.75rem-max(0.75rem,var(--desktop-titlebar)))]",
                      !showRail && "ml-3",
                    ),
              )
            : cn(
                "h-full overflow-hidden",
                peeking && "shadow-[0_8px_30px_oklch(0_0_0/0.12)]",
              ),
        )}
      >
      {/* Browser classic only — desktop chrome sits on the traffic-light row. */}
      {!floating && !macDesktop ? (
        <div
          className="w-full shrink-0"
          style={{ height: "var(--desktop-titlebar)" }}
          aria-hidden
        />
      ) : null}
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col",
          // Same fill as chat — no hairline between menu and transcript.
        )}
      >
      {/* Web / floating — header icons live inside the menu column only. */}
      {!macDesktop ? <WindowChrome hideHistory={peeking} /> : null}

      {inSettings ? (
        <nav
          className={cn(
            "min-h-0 flex-1 overflow-y-auto px-2",
            macDesktop || floating ? "mt-2" : "mt-3.5",
          )}
          aria-label="Settings"
        >
          <button
            type="button"
            onClick={() => {
              if (canGoBack) goBack();
              else newChat();
            }}
            className="mb-0.5 flex w-full items-center gap-2.5 rounded-[10px] px-3 py-1.5 text-left text-[13.5px] transition-colors duration-200 hover:bg-sidebar-accent"
            aria-label="Back"
          >
            <ArrowLeft
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
              strokeWidth={2}
            />
            <span className="font-medium tracking-[-0.01em]">Back</span>
          </button>
          {settingsNav.map((tab) => {
            const Icon = settingsIcons[tab.id];
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSettingsTab(tab.id)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-[10px] px-3 py-1.5 text-left text-[13.5px] transition-colors duration-200",
                  settingsTab === tab.id
                    ? "bg-sidebar-accent font-medium"
                    : "hover:bg-sidebar-accent",
                )}
              >
                <Icon
                  className="h-3.5 w-3.5 text-muted-foreground"
                  strokeWidth={2}
                />
                {tab.label}
              </button>
            );
          })}
        </nav>
      ) : (
        <>
          <nav
            className={cn(
              "flex min-h-0 flex-1 flex-col overflow-hidden px-2",
              macDesktop || floating ? "mt-2" : "mt-3.5",
            )}
            aria-label="Main"
          >
            <div className="min-h-0 shrink overflow-y-auto">
              {mainNavItems.map((item) => (
                <SidebarNavButton
                  key={item.id}
                  id={item.id}
                  Icon={item.Icon}
                  label={item.label}
                  active={navActive(item.id)}
                  comingSoon={item.comingSoon}
                  onOpen={openNav}
                />
              ))}
            </div>

            <div className="relative mt-3 min-h-0 flex-1 overflow-hidden">
              <div className="h-full overflow-y-auto">
                {visiblePins.length > 0 ? (
                  <div className="group/pins">
                    <div className="mb-1 flex items-center gap-1 px-3">
                      <p className="min-w-0 flex-1 text-[12px] text-muted-foreground">
                        Pinned
                      </p>
                      <PinnedFilterMenu />
                    </div>
                    {visiblePins.map(renderPinnedRow)}
                  </div>
                ) : null}
              </div>
            </div>
          </nav>

          <div className="shrink-0 px-2 pb-2">
            <AccountMenu />
          </div>
        </>
      )}
      </div>
    </aside>
      </div>
    </div>
    </>
  );
}

function SidebarNavButton({
  id,
  Icon,
  label,
  active,
  comingSoon,
  onOpen,
}: {
  id: SidebarNavId;
  Icon: (props: { className?: string; strokeWidth?: number }) => ReactNode;
  label: string;
  active: boolean;
  comingSoon?: boolean;
  onOpen: (id: SidebarNavId) => void;
}) {
  const tinted =
    id === "home" ||
    id === "work" ||
    id === "build" ||
    id === "research" ||
    id === "studio";
  return (
    <button
      type="button"
      disabled={comingSoon}
      aria-disabled={comingSoon || undefined}
      onClick={() => {
        if (!comingSoon) onOpen(id);
      }}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left text-[13.5px] transition-colors duration-200",
        comingSoon
          ? "cursor-default opacity-70"
          : active
            ? "bg-sidebar-accent font-medium"
            : "hover:bg-sidebar-accent",
      )}
    >
      <Icon
        className={cn(
          "h-3.5 w-3.5 shrink-0",
          tinted ? spaceIconTint(id as SpaceId) : "text-muted-foreground",
        )}
        strokeWidth={2}
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {comingSoon ? (
        <span className="shrink-0 rounded-full bg-sidebar-accent px-2 py-0.5 text-[10px] font-medium tracking-[0.02em] text-muted-foreground">
          Coming soon
        </span>
      ) : null}
    </button>
  );
}

function PinnedLeading({
  item,
}: {
  item: {
    kind: "thread" | "project" | "connector";
    icon?: string;
    spaceId?: SpaceId;
  };
}) {
  const iconClass = "h-3.5 w-3.5 shrink-0 text-muted-foreground";
  if (item.kind === "connector") {
    return <ConnectorMark id={item.icon ?? "connector"} size="nav" />;
  }
  if (item.kind === "project") {
    const Icon =
      (item.spaceId && spaceIcons[item.spaceId]) || FolderKanban;
    return <Icon className={iconClass} strokeWidth={2} />;
  }
  const Icon =
    (item.spaceId && spaceIcons[item.spaceId]) || MessageSquare;
  return <Icon className={iconClass} strokeWidth={2} />;
}

function PinnedRow({
  kind,
  id,
  title,
  active,
  onOpen,
  onReorder,
  leading,
}: {
  kind: PinKind;
  id: string;
  title: string;
  active: boolean;
  onOpen: () => void;
  onReorder: (
    from: { kind: PinKind; id: string },
    to: { kind: PinKind; id: string },
  ) => void;
  leading?: ReactNode;
}) {
  const [dragging, setDragging] = useState(false);
  const [over, setOver] = useState(false);
  const dragKey = `${kind}:${id}`;
  const skipClick = useRef(false);

  return (
    <div
      className={cn(
        "group flex w-full items-center rounded-lg transition-colors duration-200",
        active ? "bg-sidebar-accent" : "hover:bg-sidebar-accent",
        dragging && "opacity-50",
        over && !dragging && "ring-1 ring-foreground/20",
      )}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        const raw =
          event.dataTransfer.getData("text/pin") ||
          event.dataTransfer.getData("text/plain");
        if (!raw || raw === dragKey) return;
        const [fromKind, fromId] = raw.split(":") as [PinKind, string];
        if (!fromKind || !fromId) return;
        onReorder({ kind: fromKind, id: fromId }, { kind, id });
      }}
    >
      <button
        type="button"
        onClick={() => {
          if (skipClick.current) return;
          onOpen();
        }}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2.5 truncate px-3 py-1.5 text-left text-[13.5px]",
          active && "font-medium",
        )}
      >
        {leading ?? (
          <MessageSquare
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
            strokeWidth={2}
          />
        )}
        {title}
      </button>
      <button
        type="button"
        draggable
        aria-label={`Reorder ${title}`}
        title="Drag to reorder"
        onDragStart={(event) => {
          skipClick.current = true;
          setDragging(true);
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", dragKey);
          event.dataTransfer.setData("text/pin", dragKey);
        }}
        onDragEnd={() => {
          setDragging(false);
          setOver(false);
          window.setTimeout(() => {
            skipClick.current = false;
          }, 0);
        }}
        className={cn(
          "inline-flex h-6 w-5 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground transition-opacity duration-200 active:cursor-grabbing",
          // Only while hovering / dragging — not while the pin is merely selected.
          dragging
            ? "opacity-100"
            : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
        )}
      >
        <GripVertical className="h-3.5 w-3.5" strokeWidth={1.8} />
      </button>
      <PinControl kind={kind} id={id} className="mr-1" />
    </div>
  );
}
