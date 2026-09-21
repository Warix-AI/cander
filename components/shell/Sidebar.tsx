"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type DragEvent,
  type ReactNode,
} from "react";
import { GripVertical, MessageSquare } from "lucide-react";
import { AppsMoreSection } from "@/components/shell/AppsMoreSection";
import { ContextualNavHeader, ContextualSectionLabel } from "@/components/shell/ContextualNavPanel";
import { PinPreviewThumb } from "@/components/shell/PinPreviewThumb";
import { PrimaryNavRail } from "@/components/shell/PrimaryNavRail";
import { WindowChrome } from "@/components/shell/WindowChrome";
import { LeftNavToggleDock } from "@/components/shell/NavToggle";
import { WorkspaceMark } from "@/components/shell/WorkspaceMark";
import { useApp } from "@/components/app/AppProvider";
import { useRunningExpertState } from "@/components/agents/useRunningExpertProjectIds";
import { workspacesFor } from "@/lib/entitlements";
import { SIDEBAR_ROW_HOVER } from "@/lib/mobile-menu-styles";
import {
  persistContextNavOpen,
  persistLastNavItem,
  persistPrimaryNavSection,
  PRIMARY_NAV_LABEL,
  readContextNavOpen,
  readLastNavItem,
  readPrimaryNavSection,
  type PrimaryNavSection,
} from "@/lib/nav-primary";
import { usePinDisplayPrefs } from "@/lib/pin-display-prefs";
import {
  ensurePrimaryPinSections,
  groupPinnedItemsBySection,
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

const PEEK_CLOSE_MS = 160;
const PEEK_EXIT_MS = 420;
const CONTEXT_WIDTH_PX = 240;

/** Map primary rail section → pin folder id (except workspaces). */
const SECTION_TO_PIN: Record<
  Exclude<PrimaryNavSection, "workspaces">,
  PinSectionId
> = {
  apps: "connectors",
  chats: "chats",
  images: "images",
};

const PIN_TO_SECTION: Partial<Record<PinSectionId, PrimaryNavSection>> = {
  connectors: "apps",
  chats: "chats",
  images: "images",
};

export function Sidebar() {
  const {
    spaceId,
    threadId,
    projectId,
    sidebarOpen,
    setSidebarOpen,
    reorderPins,
    openThread,
    openProject,
    openConnector,
    openConnectorConnect,
    openSpace,
    connectorId,
    entitlements,
    actor,
    workspaceId,
    workspace,
    setWorkspace,
    view,
    newChat,
    openExpertSetup,
    expertSetupId,
    openOverlay,
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
  const [section, setSection] = useState<PrimaryNavSection>(readPrimaryNavSection);
  const [contextFilter, setContextFilter] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const peekCloseTimer = useRef<number | null>(null);
  const peekExitTimer = useRef<number | null>(null);
  const edgeRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const peekRef = useRef(false);
  const skipRestoreRef = useRef(false);

  useEffect(() => {
    // Hydrate collapse preference once on mount.
    const open = readContextNavOpen();
    if (!open) setSidebarOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  useEffect(() => {
    persistContextNavOpen(sidebarOpen);
  }, [sidebarOpen]);

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
  /** Entire left nav (rail + contextual) — not just the context column. */
  const navVisible = sidebarOpen || peeking;

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

  const desktop = useDesktopShell();
  const macDesktop = desktop;
  const allowedWorkspaces = workspacesFor(actor, entitlements);

  const openPinnedItem = useCallback(
    (item: PinnedItem) => {
      if (item.kind === "thread") openThread(item.id);
      else if (item.kind === "connector") openConnector(item.id);
      else if (item.expertCatalog) openExpertSetup(item.id);
      else if (item.projectKind === "automation") {
        openProject(item.id, {
          agentSurface: "overview",
          landOnPanel: true,
        });
      } else openProject(item.id);
    },
    [openThread, openConnector, openExpertSetup, openProject],
  );

  const pinGroups = useMemo(
    () =>
      ensurePrimaryPinSections(
        groupPinnedItemsBySection(pinnedItems, {
          visibleKinds: pinPrefs.visible,
        }),
      ),
    [pinnedItems, pinPrefs],
  );
  const navPinGroups = useMemo(() => {
    const wanted: PinSectionId[] = ["connectors", "chats", "images"];
    return wanted.map(
      (id) =>
        pinGroups.find((group) => group.id === id) ?? {
          id,
          items: [] as PinnedItem[],
        },
    );
  }, [pinGroups]);

  const pinRowActive = (item: PinnedItem) => {
    if (item.kind === "thread") return threadId === item.id;
    if (item.kind === "connector")
      return connectorId === item.id && spaceId === "connectors";
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

  // Follow destination into Apps / Automations / Chats.
  useEffect(() => {
    if (view === "settings") return;
    if (!activePinKey) return;
    const owning = pinGroups.find((group) =>
      group.items.some((item) => `${item.kind}:${item.id}` === activePinKey),
    );
    if (!owning) return;
    const next = PIN_TO_SECTION[owning.id];
    if (!next) return;
    skipRestoreRef.current = true;
    setSection(next);
    persistPrimaryNavSection(next);
    persistLastNavItem(next, activePinKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pinGroups read on nav change only
  }, [view, activePinKey]);

  const activePinGroup = useMemo(() => {
    if (section === "workspaces") return null;
    const pinId = SECTION_TO_PIN[section];
    return (
      navPinGroups.find((group) => group.id === pinId) ?? {
        id: pinId,
        items: [] as PinnedItem[],
      }
    );
  }, [navPinGroups, section]);

  const filterNeedle = contextFilter.trim().toLowerCase();

  const filteredPinItems = useMemo(() => {
    if (!activePinGroup) return [] as PinnedItem[];
    if (!filterNeedle) return activePinGroup.items;
    return activePinGroup.items.filter((item) =>
      item.title.toLowerCase().includes(filterNeedle),
    );
  }, [activePinGroup, filterNeedle]);

  const restoreLastItem = useCallback(
    (next: PrimaryNavSection) => {
      if (skipRestoreRef.current) {
        skipRestoreRef.current = false;
        return;
      }
      const last = readLastNavItem(next);
      if (!last) return;
      const [kind, id] = last.split(":") as [PinKind | "workspace", string];
      if (!kind || !id) return;
      if (kind === "workspace") {
        setWorkspace(id);
        return;
      }
      const item = pinnedItems.find((row) => row.kind === kind && row.id === id);
      if (item) openPinnedItem(item);
    },
    [pinnedItems, openPinnedItem, setWorkspace],
  );

  const selectSection = useCallback(
    (next: PrimaryNavSection) => {
      setSection(next);
      persistPrimaryNavSection(next);
      setContextFilter("");
      setSearchOpen(false);
      if (!sidebarOpen) setSidebarOpen(true);
      restoreLastItem(next);
    },
    [restoreLastItem, sidebarOpen, setSidebarOpen],
  );

  // Keyboard: Alt+1..4 switches primary section.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.altKey || event.metaKey) || event.shiftKey || event.ctrlKey) {
        return;
      }
      const map: Record<string, PrimaryNavSection> = {
        Digit1: "workspaces",
        Digit2: "apps",
        Digit3: "chats",
        Digit4: "images",
        Numpad1: "workspaces",
        Numpad2: "apps",
        Numpad3: "chats",
        Numpad4: "images",
      };
      const next = map[event.code];
      if (!next) return;
      event.preventDefault();
      selectSection(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectSection]);

  const rememberItem = useCallback(
    (item: PinnedItem) => {
      if (section === "workspaces") return;
      persistLastNavItem(section, `${item.kind}:${item.id}`);
    },
    [section],
  );

  const renderPinnedRow = (item: PinnedItem) => (
    <PinnedRow
      key={`${item.kind}-${item.id}`}
      kind={item.kind}
      id={item.id}
      title={item.title}
      hoverTitle={
        item.expertKind ? `${item.expertKind} expert` : undefined
      }
      leading={
        item.kind === "thread" && section !== "images" ? (
          null
        ) : (
          <PinPreviewThumb item={item} />
        )
      }
      hideLeading={item.kind === "thread" && section !== "images"}
      inUse={
        item.expertCatalog
          ? view === "expert" && expertSetupId === item.id
          : pinRowActive(item)
      }
      running={
        item.projectKind === "automation" &&
        !item.expertCatalog &&
        runningExperts.projectIds.has(item.id)
      }
      onOpen={() => {
        rememberItem(item);
        openPinnedItem(item);
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
    items: PinnedItem[],
  ) => (
    <SidebarPinSectionBody
      group={{ ...group, items }}
      renderPinnedRow={renderPinnedRow}
      onConnect={(id) => openConnectorConnect(id)}
      section={section}
      filter={filterNeedle}
    />
  );

  const renderWorkspaceSegment = () => {
    const list = filterNeedle
      ? allowedWorkspaces.filter((item) =>
          item.name.toLowerCase().includes(filterNeedle),
        )
      : allowedWorkspaces;
    return (
      <div className="flex flex-col gap-0">
        {list.map((item) => {
          const active = item.id === workspace.id;
          return (
            <div
              key={item.id}
              className={cn(
                "group relative flex w-full items-center rounded-[8px] transition-colors duration-150",
                active ? "shell-select-active" : SIDEBAR_ROW_HOVER,
              )}
            >
              <button
                type="button"
                onClick={() => {
                  setWorkspace(item.id);
                  persistLastNavItem("workspaces", `workspace:${item.id}`);
                }}
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-2.5 truncate px-2.5 py-[7.2px] text-left text-[14px] tracking-[-0.01em]",
                  active && "font-medium",
                )}
              >
                <span
                  data-pin-leading
                  className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center overflow-visible"
                >
                  <WorkspaceMark
                    id={item.id}
                    name={item.name}
                    active={active}
                    size="nav"
                  />
                </span>
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  const onPrimaryAction = () => {
    if (section === "apps") {
      openSpace("connectors");
      return;
    }
    if (section === "chats") {
      newChat();
      return;
    }
    if (section === "workspaces") {
      openOverlay("workspace");
      return;
    }
    openSpace("studio");
  };

  const contextInner = (
    <>
      <ContextualNavHeader
        section={section}
        onPrimaryAction={onPrimaryAction}
        searchOpen={searchOpen}
        onToggleSearch={() => {
          setSearchOpen((open) => {
            if (open) setContextFilter("");
            return !open;
          });
        }}
        searchValue={contextFilter}
        onSearchChange={setContextFilter}
        searchPlaceholder={
          section === "apps"
            ? "Filter apps"
            : section === "images"
              ? "Search images"
              : "Search chats"
        }
      />

      <div className="relative mt-1 min-h-0 flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto pb-1">
          <div className="flex flex-col gap-0.5">
            {section === "workspaces"
              ? renderWorkspaceSegment()
              : activePinGroup
                ? renderPinSectionChildren(activePinGroup, filteredPinItems)
                : null}
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
      <LeftNavToggleDock peeking={peeking} />
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
          "hidden h-full max-w-[100vw] shrink-0 flex-col lg:flex",
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
        aria-hidden={!navVisible}
      >
        {/*
          Full-height docked menu (Cursor-style): flush top/bottom, right stroke
          only — no floating island / G3 card.
        */}
        <div
          className={cn(
            "flex h-full w-[calc(56px+240px)] shrink-0 flex-col overflow-hidden border-r border-black/[0.08] bg-sidebar text-sidebar-foreground dark:border-white/[0.1]",
            peeking && "shadow-[0_8px_30px_oklch(0_0_0/0.12)]",
          )}
        >
          <WindowChrome
            clearTrafficLights={macDesktop}
            navChrome
            className="w-full bg-transparent text-foreground"
          />

          <div className="relative flex min-h-0 flex-1">
            <PrimaryNavRail section={section} onSection={selectSection} />

            <div
              className="flex min-h-0 w-[240px] flex-col overflow-hidden border-l border-black/[0.06] dark:border-white/[0.06]"
              style={{ width: CONTEXT_WIDTH_PX }}
            >
              <nav
                className="flex h-full min-h-0 flex-1 flex-col overflow-hidden px-2 pb-2 pt-1"
                aria-label={PRIMARY_NAV_LABEL[section]}
              >
                {contextInner}
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
  section,
  filter,
}: {
  group: { id: PinSectionId; items: PinnedItem[] };
  renderPinnedRow: (item: PinnedItem) => ReactNode;
  onConnect: (id: string) => void;
  section: PrimaryNavSection;
  filter: string;
}) {
  if (section === "chats" || section === "images") {
    const emptyLabel =
      section === "images"
        ? filter
          ? "No matching images"
          : "No images yet"
        : filter
          ? "No matching chats"
          : "No chats yet";
    return (
      <>
        {group.items.length ? (
          <>
            <ContextualSectionLabel>Recent</ContextualSectionLabel>
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => renderPinnedRow(item))}
            </div>
          </>
        ) : (
          <p className="px-2.5 py-3 text-[13px] text-muted-foreground">
            {emptyLabel}
          </p>
        )}
      </>
    );
  }

  // Apps
  return (
    <>
      {group.items.length ? (
        <>
          <ContextualSectionLabel>Connected</ContextualSectionLabel>
          <div
            className={cn(
              "flex flex-col",
              group.id === "connectors" ? "gap-0" : "gap-0.5",
            )}
          >
            {group.items.map((item) => renderPinnedRow(item))}
          </div>
        </>
      ) : null}
      {group.id === "connectors" ? (
        <AppsMoreSection
          listedIds={group.items.map((item) => item.id)}
          onConnect={onConnect}
          query={filter}
        />
      ) : null}
    </>
  );
}

function PinnedRow({
  kind,
  id,
  title,
  hoverTitle,
  inUse,
  running,
  onOpen,
  onReorder,
  leading,
  hideLeading = false,
  dragActiveKey,
  onDragActiveKeyChange,
}: {
  kind: PinKind;
  id: string;
  title: string;
  hoverTitle?: string;
  inUse: boolean;
  running?: boolean;
  onOpen: () => void;
  onReorder: (
    from: { kind: PinKind; id: string },
    to: { kind: PinKind; id: string },
    placement?: "before" | "after",
  ) => void;
  leading?: ReactNode;
  hideLeading?: boolean;
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
        title={hoverTitle}
        onClick={onOpen}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2.5 truncate px-2.5 text-left text-[14px] tracking-[-0.01em]",
          kind === "connector" || kind === "project" ? "py-[7.2px]" : "py-2",
          inUse && "font-medium",
        )}
      >
        {hideLeading ? null : (
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
        )}
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
      {running ? (
        <div className="relative mr-1 flex h-6 w-6 shrink-0 items-center justify-center">
          <span
            aria-hidden
            title="Expert running"
            className="pointer-events-none h-1.5 w-1.5 animate-pulse rounded-full bg-[#0b4fc4]"
          />
        </div>
      ) : null}
    </div>
  );
}
