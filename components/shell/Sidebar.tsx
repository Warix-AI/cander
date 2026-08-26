"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  ArrowLeft,
  Building2,
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
import { WindowChrome } from "@/components/shell/WindowChrome";
import { LeftNavToggleDock } from "@/components/shell/NavToggle";
import { WorkspaceRail } from "@/components/shell/WorkspaceRail";
import { useApp } from "@/components/app/AppProvider";
import { visibleSettingsTabs } from "@/lib/settings-nav";
import { workspacesFor } from "@/lib/entitlements";
import { spaceIcons, spaceIconTint } from "@/lib/space-icons";
import { type SidebarNavId, isExtraNavId } from "@/lib/spaces";
import {
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

  const mainNavItems = useMainNavItems();
  const { pinnedItems } = usePinnedItems();
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
      setPeek(false);
      setPeekVisible(false);
    }
  }, [sidebarOpen]);

  useEffect(() => {
    return () => {
      if (peekCloseTimer.current) window.clearTimeout(peekCloseTimer.current);
      if (peekExitTimer.current) window.clearTimeout(peekExitTimer.current);
    };
  }, []);

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
  /** Classic Mac: chrome on the traffic-light row, spanning rail + menu. */
  const macClassic = desktop && !floating;
  const peeking = peek && !sidebarOpen;
  const workspaceCount = workspacesFor(actor, entitlements).length;
  const showRail =
    entitlements.hasWorkspaces &&
    !entitlements.showInviteWall &&
    workspaceRailOpen &&
    workspaceCount >= 2;

  const settingsNav = visibleSettingsTabs(entitlements);
  const chatActive = view === "chat" && !threadId && !spaceId;

  const navActive = (id: SidebarNavId) => {
    if (id === "recents") return view === "recents";
    if (id === "research" && view === "browser") return true;
    return spaceId === id && (view === "space" || view === "chat");
  };

  const openNav = (id: SidebarNavId) => {
    if (id === "browser") openBrowser();
    else if (id === "recents") openRecents();
    else if (!isExtraNavId(id)) openSpace(id);
  };

  const NavBtn = ({ id }: { id: SidebarNavId }) => {
    const item = mainNavItems.find((entry) => entry.id === id);
    if (!item) return null;
    const { Icon, label } = item;
    const active = navActive(id);
    const tinted =
      id === "work" || id === "build" || id === "research";
    return (
      <button
        type="button"
        onClick={() => openNav(id)}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left text-[13.5px] transition-colors duration-200",
          active ? "bg-sidebar-accent font-medium" : "hover:bg-sidebar-accent",
        )}
      >
        <Icon
          className={cn(
            "h-3.5 w-3.5",
            tinted ? spaceIconTint(id) : "text-muted-foreground",
          )}
          strokeWidth={2}
        />
        {label}
      </button>
    );
  };

  const renderPinnedRow = (item: PinnedItem) => (
    <PinnedRow
      key={`${item.kind}-${item.id}`}
      kind={item.kind}
      id={item.id}
      title={item.title}
      leading={<PinnedLeading item={item} />}
      active={
        item.kind === "thread"
          ? threadId === item.id
          : item.kind === "connector"
            ? connectorId === item.id && spaceId === "connectors"
            : projectId === item.id && !threadId
      }
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
          macClassic && "flex-col",
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
      {macClassic ? (
        <WindowChrome
          clearTrafficLights
          className="w-full bg-sidebar text-sidebar-foreground"
        />
      ) : null}

      <div
        className={cn(
          "flex min-h-0",
          macClassic ? "flex-1" : "h-full",
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
                // Top clears traffic lights in desktop shell; bottom keeps floating gap.
                "mb-3 mr-2 mt-[max(0.75rem,var(--desktop-titlebar))] h-[calc(100%-0.75rem-max(0.75rem,var(--desktop-titlebar)))]",
                !showRail && "ml-3",
              )
            : cn(
                "h-full overflow-hidden",
                peeking && "shadow-[0_8px_30px_oklch(0_0_0/0.12)]",
              ),
        )}
      >
      {/* Browser classic only — Mac classic chrome sits on the traffic-light row. */}
      {!floating && !macClassic ? (
        <div
          className="w-full shrink-0"
          style={{ height: "var(--desktop-titlebar)" }}
          aria-hidden
        />
      ) : null}
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col",
          !floating && "border-r border-sidebar-border",
        )}
      >
      {!macClassic ? <WindowChrome /> : null}

      {inSettings ? (
        <nav
          className={cn(
            "min-h-0 flex-1 overflow-y-auto px-2",
            macClassic ? "mt-2" : "mt-3.5",
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
              macClassic ? "mt-2" : "mt-3.5",
            )}
            aria-label="Main"
          >
            <div className="min-h-0 shrink overflow-y-auto">
              <button
                type="button"
                onClick={() => newChat()}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left text-[13.5px] transition-colors duration-200",
                  chatActive
                    ? "bg-sidebar-accent font-medium"
                    : "hover:bg-sidebar-accent",
                )}
              >
                <SquarePen
                  className="h-3.5 w-3.5 text-muted-foreground"
                  strokeWidth={2}
                />
                New Chat
              </button>
              {mainNavItems.map(({ id }) => (
                <NavBtn key={id} id={id} />
              ))}
            </div>

            <div className="relative mt-3 min-h-0 flex-1 overflow-hidden">
              <div className="h-full overflow-y-auto">
                <p className="px-3 pb-1 text-[12px] text-muted-foreground">
                  Pinned
                </p>
                {pinnedItems.length ? (
                  pinnedItems.map(renderPinnedRow)
                ) : (
                  <p className="px-3 py-1.5 text-[12px] text-muted-foreground/70">
                    No pinned items
                  </p>
                )}
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

function PinnedLeading({
  item,
}: {
  item: {
    kind: "thread" | "project" | "connector";
    icon?: string;
    spaceId?: SpaceId;
  };
}) {
  if (item.kind === "connector") {
    return <ConnectorMark id={item.icon ?? "connector"} size="nav" />;
  }
  if (item.kind === "project") {
    const Icon =
      (item.spaceId && spaceIcons[item.spaceId]) || FolderKanban;
    return (
      <Icon
        className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
        strokeWidth={2}
      />
    );
  }
  const Icon =
    (item.spaceId && spaceIcons[item.spaceId]) || MessageSquare;
  return (
    <Icon
      className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
      strokeWidth={2}
    />
  );
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
          active || dragging
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
