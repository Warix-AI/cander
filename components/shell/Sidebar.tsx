"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type DragEvent, type ReactNode } from "react";
import {
  AudioLines,
  CircleUser,
  GripVertical,
  MessageSquare,
  SquarePen,
  type LucideIcon,
} from "lucide-react";
import { AppsMoreSection } from "@/components/shell/AppsMoreSection";
import { PinControl } from "@/components/shell/PinControl";
import { PinPreviewThumb } from "@/components/shell/PinPreviewThumb";
import { WindowChrome } from "@/components/shell/WindowChrome";
import { LeftNavToggleDock } from "@/components/shell/NavToggle";
import { WorkspaceRail } from "@/components/shell/WorkspaceRail";
import { useApp } from "@/components/app/AppProvider";
import { useRunningExpertState } from "@/components/agents/useRunningExpertProjectIds";
import { workspacesFor } from "@/lib/entitlements";
import {
  SIDEBAR_ROW,
  SIDEBAR_ROW_HOVER,
  SIDEBAR_ROW_ICON,
  SIDEBAR_SEGMENT_ACTIVE,
} from "@/lib/mobile-menu-styles";
import { usePinDisplayPrefs } from "@/lib/pin-display-prefs";
import {
  ensurePrimaryPinSections,
  groupPinnedItemsBySection,
  PIN_SECTION_ICONS,
  PIN_SECTION_LABEL,
  PRIMARY_PIN_SECTION_IDS,
  type PinSectionId,
} from "@/lib/pin-sections";
import {
  setSidebarPeeking,
  subscribeSidebarPeekHold,
  subscribeSidebarPeekRelease,
} from "@/lib/sidebar-peek";
import { usePinnedItems, type PinnedItem } from "@/lib/use-pinned-items";
import {
  getWorkspaceCatalogServerSnapshot,
  getWorkspaceCatalogSnapshot,
  subscribeWorkspaceCatalog,
} from "@/lib/workspace-catalog";
import type { PinKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useDesktopShell } from "@/lib/desktop-shell";
import {
  SHELL_FLOAT_MARGIN,
  SHELL_G3_RADIUS,
  SHELL_ISLAND_SIDEBAR,
  useShellStyle,
} from "@/lib/shell-chrome";

const PEEK_CLOSE_MS = 160;
const PEEK_EXIT_MS = 420;

/** Top mode strip — Apps / Experts / Chats. */
const SIDEBAR_SEGMENT_IDS = ["connectors", "agents", "chats"] as const;
type SidebarSegmentId = (typeof SIDEBAR_SEGMENT_IDS)[number];
const SEGMENT_STORAGE_KEY = "cander-sidebar-segment";

const SEGMENT_META: Record<
  SidebarSegmentId,
  { label: string; Icon: LucideIcon }
> = {
  connectors: {
    label: PIN_SECTION_LABEL.connectors,
    Icon: PIN_SECTION_ICONS.connectors,
  },
  agents: {
    label: PIN_SECTION_LABEL.agents,
    Icon: PIN_SECTION_ICONS.agents,
  },
  chats: {
    label: PIN_SECTION_LABEL.chats,
    Icon: PIN_SECTION_ICONS.chats,
  },
};

/** ~10% under prior 20px mode icons. */
const SEGMENT_ICON_CLASS = "h-[18px] w-[18px] shrink-0";

function readStoredSegment(): SidebarSegmentId {
  if (typeof window === "undefined") return "connectors";
  const raw = window.localStorage.getItem(SEGMENT_STORAGE_KEY);
  if (raw && (SIDEBAR_SEGMENT_IDS as readonly string[]).includes(raw)) {
    return raw as SidebarSegmentId;
  }
  return "connectors";
}

export function Sidebar() {
  const {
    spaceId,
    threadId,
    projectId,
    sidebarOpen,
    reorderPins,
    openThread,
    openProject,
    openConnector,
    openConnectorConnect,
    connectorId,
    entitlements,
    actor,
    workspaceRailOpen,
    workspaceId,
    view,
    newChat,
    toggleVoice,
    voiceActive,
    voiceConnecting,
    openSettings,
  } = useApp();

  const runningExperts = useRunningExpertState(workspaceId);

  const { pinnedItems } = usePinnedItems();
  const { prefs: pinPrefs } = usePinDisplayPrefs();
  useSyncExternalStore(
    subscribeWorkspaceCatalog,
    getWorkspaceCatalogSnapshot,
    getWorkspaceCatalogServerSnapshot,
  );
  const [peek, setPeek] = useState(false);
  const [peekVisible, setPeekVisible] = useState(false);
  const [pinDragKey, setPinDragKey] = useState<string | null>(null);
  const [segment, setSegment] = useState<SidebarSegmentId>(readStoredSegment);
  const peekCloseTimer = useRef<number | null>(null);
  const peekExitTimer = useRef<number | null>(null);
  const edgeRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const peekRef = useRef(false);

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
  peekRef.current = peek;

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
      // Only keep an already-open peek — never open from project / content menus.
      if (!peekRef.current) return;
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

  const selectSegment = useCallback((next: SidebarSegmentId) => {
    setSegment(next);
    try {
      window.localStorage.setItem(SEGMENT_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const pinGroups = useMemo(
    () =>
      ensurePrimaryPinSections(
        groupPinnedItemsBySection(pinnedItems, {
          visibleKinds: pinPrefs.visible,
        }),
      ),
    [pinnedItems, pinPrefs],
  );
  const primaryPinGroups = useMemo(
    () =>
      pinGroups.filter((group) =>
        PRIMARY_PIN_SECTION_IDS.includes(group.id),
      ),
    [pinGroups],
  );

  const pinRowActive = (item: PinnedItem) => {
    if (item.kind === "thread") return threadId === item.id;
    if (item.kind === "connector")
      return connectorId === item.id && spaceId === "connectors";
    // openProject always sets threadId — still highlight the pin by project.
    return projectId === item.id;
  };

  const activePinKey =
    connectorId && spaceId === "connectors"
      ? `connector:${connectorId}`
      : projectId
        ? `project:${projectId}`
        : threadId
          ? `thread:${threadId}`
          : null;

  // Follow destination into Apps / Experts / Chats.
  useEffect(() => {
    if (view === "settings") return;
    if (!activePinKey) return;
    const owning = pinGroups.find((group) =>
      group.items.some((item) => `${item.kind}:${item.id}` === activePinKey),
    );
    if (!owning) return;
    if (!(PRIMARY_PIN_SECTION_IDS as readonly string[]).includes(owning.id)) {
      return;
    }
    selectSegment(owning.id as SidebarSegmentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pinGroups read on nav change only
  }, [view, activePinKey, selectSegment]);

  const activeSegmentGroup = useMemo(
    () =>
      primaryPinGroups.find((group) => group.id === segment) ??
      primaryPinGroups[0] ?? {
        id: "connectors" as PinSectionId,
        items: [] as PinnedItem[],
      },
    [primaryPinGroups, segment],
  );

  const renderPinnedRow = (item: PinnedItem) => (
    <PinnedRow
      key={`${item.kind}-${item.id}`}
      kind={item.kind}
      id={item.id}
      title={item.title}
      leading={<PinPreviewThumb item={item} />}
      // Row background marks the active pin; pulse = Expert running.
      inUse={pinRowActive(item)}
      running={
        item.projectKind === "automation" &&
        runningExperts.projectIds.has(item.id)
      }
      onOpen={() => {
        if (item.kind === "thread") openThread(item.id);
        else if (item.kind === "connector") openConnector(item.id);
        else if (item.projectKind === "automation") {
          openProject(item.id, {
            agentSurface: "overview",
            landOnPanel: true,
          });
        } else openProject(item.id);
      }}
      onReorder={reorderPins}
      dragActiveKey={pinDragKey}
      onDragActiveKeyChange={setPinDragKey}
    />
  );

  const renderPinSectionChildren = (
    group: {
      id: PinSectionId;
      items: PinnedItem[];
    },
  ) => (
    <SidebarPinSectionBody
      group={group}
      renderPinnedRow={renderPinnedRow}
      onConnect={(id) => openConnectorConnect(id)}
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
          floating && SHELL_FLOAT_MARGIN,
          floating && !macDesktop && "mt-2.5",
        )}
      >
      <WorkspaceRail />
      <div
        className={cn(
          "flex w-[min(253px,calc(100vw-3.5rem))] shrink-0 flex-col text-sidebar-foreground lg:w-[253px]",
          floating
            ? cn(
                "overflow-hidden",
                SHELL_ISLAND_SIDEBAR,
                SHELL_G3_RADIUS,
                chromeOutside
                  ? cn("h-full", !showRail && "ml-2.5")
                  : cn(
                      "mb-2.5 mr-2 mt-[max(0.625rem,var(--desktop-titlebar))] h-[calc(100%-0.625rem-max(0.625rem,var(--desktop-titlebar)))]",
                      !showRail && "ml-2.5",
                    ),
              )
            : cn(
                "h-full overflow-hidden bg-sidebar",
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
        )}
      >
      {/* Web / floating — header icons live inside the menu column only. */}
      {!macDesktop ? <WindowChrome hideHistory={peeking} /> : null}

      <nav
          className={cn(
            "flex min-h-0 flex-1 flex-col overflow-hidden px-2 pb-2",
            macDesktop || floating ? "mt-1.5" : "mt-3.5",
          )}
          aria-label="Main"
        >
          <div
            role="tablist"
            aria-label="Sidebar section"
            className="flex shrink-0 gap-0.5"
          >
            {SIDEBAR_SEGMENT_IDS.map((id) => {
              const { label, Icon } = SEGMENT_META[id];
              const active = segment === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-label={label}
                  aria-selected={active}
                  title={label}
                  onClick={() => selectSegment(id)}
                  className={cn(
                    "flex min-w-0 items-center justify-center gap-1.5 px-1.5 py-2 transition-[background-color,box-shadow,color,backdrop-filter,flex-grow] duration-150",
                    SHELL_G3_RADIUS,
                    active
                      ? cn(SIDEBAR_SEGMENT_ACTIVE, "flex-[1.35]")
                      : "flex-1 text-muted-foreground",
                  )}
                >
                  <Icon className={SEGMENT_ICON_CLASS} strokeWidth={1.85} />
                  {active ? (
                    <span className="min-w-0 truncate text-[12px] tracking-[-0.01em]">
                      {label}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="relative mt-2.5 min-h-0 flex-1 overflow-hidden">
            <div className="h-full overflow-y-auto pb-1">
              <div className="flex flex-col gap-0.5">
                {renderPinSectionChildren(activeSegmentGroup)}
              </div>
            </div>
          </div>

          <div className="mt-2 flex shrink-0 flex-col gap-0.5 border-t border-black/[0.06] pt-2 dark:border-white/[0.08]">
            <button
              type="button"
              onClick={() => newChat()}
              className={cn(SIDEBAR_ROW, SIDEBAR_ROW_HOVER)}
            >
              <SquarePen className={SIDEBAR_ROW_ICON} strokeWidth={2} />
              <span className="min-w-0 flex-1 truncate">New</span>
            </button>
            {entitlements.hasVoice ? (
              <button
                type="button"
                aria-pressed={voiceActive || voiceConnecting}
                onClick={() => toggleVoice()}
                className={cn(
                  SIDEBAR_ROW,
                  SIDEBAR_ROW_HOVER,
                  (voiceActive || voiceConnecting) && "shell-select-active",
                )}
              >
                <AudioLines className={SIDEBAR_ROW_ICON} strokeWidth={2} />
                <span className="min-w-0 flex-1 truncate">Voice</span>
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => openSettings("general")}
              className={cn(
                SIDEBAR_ROW,
                SIDEBAR_ROW_HOVER,
                view === "settings" && "shell-select-active",
              )}
            >
              <CircleUser className={SIDEBAR_ROW_ICON} strokeWidth={2} />
              <span className="min-w-0 flex-1 truncate">General</span>
            </button>
          </div>
        </nav>

      </div>
    </div>
      </div>
    </div>
    </>
  );
}

function SidebarPinSectionBody({
  group,
  renderPinnedRow,
  onConnect,
}: {
  group: { id: PinSectionId; items: PinnedItem[] };
  renderPinnedRow: (item: PinnedItem) => ReactNode;
  onConnect: (id: string) => void;
}) {
  return (
    <>
      <div
        className={cn(
          "flex flex-col",
          group.id === "connectors" ? "gap-0" : "gap-0.5",
        )}
      >
        {group.items.map((item) => renderPinnedRow(item))}
      </div>
      {group.id === "connectors" ? (
        <AppsMoreSection
          listedIds={group.items.map((item) => item.id)}
          onConnect={onConnect}
          query=""
        />
      ) : null}
    </>
  );
}

function PinnedRow({
  kind,
  id,
  title,
  inUse,
  running,
  onOpen,
  onReorder,
  leading,
  dragActiveKey,
  onDragActiveKeyChange,
}: {
  kind: PinKind;
  id: string;
  title: string;
  inUse: boolean;
  running?: boolean;
  onOpen: () => void;
  onReorder: (
    from: { kind: PinKind; id: string },
    to: { kind: PinKind; id: string },
    placement?: "before" | "after",
  ) => void;
  leading?: ReactNode;
  dragActiveKey: string | null;
  onDragActiveKeyChange: (key: string | null) => void;
}) {
  const [dropPlacement, setDropPlacement] = useState<"before" | "after" | null>(
    null,
  );
  const rowRef = useRef<HTMLDivElement>(null);
  const dragKey = `${kind}:${id}`;
  const dragging = dragActiveKey === dragKey;

  useEffect(() => {
    if (!dragActiveKey) setDropPlacement(null);
  }, [dragActiveKey]);

  const placementFromEvent = (event: {
    clientY: number;
  }): "before" | "after" => {
    const rect = rowRef.current?.getBoundingClientRect();
    if (!rect) return "before";
    return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
  };

  return (
    <div
      ref={rowRef}
      data-pin-tree-key={dragKey}
      className={cn(
        "group relative flex w-full items-center rounded-[8px] transition-colors duration-150",
        inUse ? "shell-select-active" : SIDEBAR_ROW_HOVER,
        dragging && "opacity-40",
      )}
      onDragOver={(event) => {
        if (!dragActiveKey || dragActiveKey === dragKey) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setDropPlacement(placementFromEvent(event));
      }}
      onDragLeave={(event) => {
        const next = event.relatedTarget as Node | null;
        if (next && rowRef.current?.contains(next)) return;
        setDropPlacement(null);
      }}
      onDrop={(event) => {
        event.preventDefault();
        const raw =
          event.dataTransfer.getData("text/pin") ||
          event.dataTransfer.getData("text/plain");
        const placement = placementFromEvent(event);
        setDropPlacement(null);
        onDragActiveKeyChange(null);
        if (!raw || raw === dragKey) return;
        const [fromKind, fromId] = raw.split(":") as [PinKind, string];
        if (!fromKind || !fromId) return;
        onReorder({ kind: fromKind, id: fromId }, { kind, id }, placement);
      }}
    >
      {dropPlacement === "before" ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-2 top-0 z-10 h-0.5 -translate-y-1/2 rounded-full bg-foreground/70"
        />
      ) : null}
      {dropPlacement === "after" ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-2 bottom-0 z-10 h-0.5 translate-y-1/2 rounded-full bg-foreground/70"
        />
      ) : null}
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          // Connected apps: ~10% tighter vertical padding than discover rows.
          "flex min-w-0 flex-1 items-center gap-2.5 truncate px-2.5 text-left text-[14px] tracking-[-0.01em]",
          kind === "connector" ? "py-[7.2px]" : "py-2",
          inUse && "font-medium",
        )}
      >
        <span
          data-pin-leading
          className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center overflow-visible"
        >
          {leading ?? (
            <MessageSquare
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
              strokeWidth={2}
            />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate">{title}</span>
      </button>
      <button
        type="button"
        draggable
        aria-label={`Reorder ${title}`}
        title="Drag to reorder"
        onDragStart={(event: DragEvent) => {
          onDragActiveKeyChange(dragKey);
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", dragKey);
          event.dataTransfer.setData("text/pin", dragKey);
          if (rowRef.current) {
            event.dataTransfer.setDragImage(rowRef.current, 16, 16);
          }
        }}
        onDragEnd={() => {
          setDropPlacement(null);
          onDragActiveKeyChange(null);
        }}
        className={cn(
          "inline-flex h-6 w-5 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground transition-opacity duration-150 active:cursor-grabbing",
          dragging
            ? "opacity-100"
            : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
        )}
      >
        <GripVertical className="h-4 w-4" strokeWidth={1.8} />
      </button>
      {kind === "connector" ? (
        running ? (
          <div className="relative mr-1 flex h-6 w-6 shrink-0 items-center justify-center">
            <span
              aria-hidden
              title="Expert running"
              className="pointer-events-none h-1.5 w-1.5 animate-pulse rounded-full bg-[#0b4fc4]"
            />
          </div>
        ) : null
      ) : (
        <div className="relative mr-1 flex h-6 w-6 shrink-0 items-center justify-center">
          {running ? (
            <span
              aria-hidden
              title="Expert running"
              className="pointer-events-none absolute h-1.5 w-1.5 animate-pulse rounded-full bg-[#0b4fc4] transition-opacity duration-150 group-hover:opacity-0"
            />
          ) : null}
          <PinControl kind={kind} id={id} />
        </div>
      )}
    </div>
  );
}
