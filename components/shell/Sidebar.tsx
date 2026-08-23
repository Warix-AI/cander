"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Blocks,
  Building2,
  CreditCard,
  FolderKanban,
  GripVertical,
  LayoutGrid,
  MessageSquare,
  Palette,
  SquarePen,
  UserRound,
  X,
} from "lucide-react";
import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import { PinControl } from "@/components/shell/PinControl";
import { ProductSwitcher } from "@/components/shell/ProductSwitcher";
import { WindowChrome } from "@/components/shell/WindowChrome";
import { WorkspaceRail } from "@/components/shell/WorkspaceRail";
import { useApp } from "@/components/app/AppProvider";
import { platformNavItems, projects, spaces, connectors } from "@/lib/data";
import { visibleSettingsTabs } from "@/lib/settings-nav";
import {
  extraNavLabels,
  navIcon,
  platformNavIcons,
  spaceIcons,
} from "@/lib/space-icons";
import {
  isExtraNavId,
  resolveSidebarNav,
  type SidebarNavId,
} from "@/lib/spaces";
import type { PinKind, PinTier, SettingsTab, SpaceId } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SHELL_FLOAT_RADIUS, useShellStyle } from "@/lib/shell-chrome";
import { memberSpaces } from "@/lib/workspace-policy";

const settingsIcons: Record<SettingsTab, typeof Building2> = {
  organization: Building2,
  workspaces: LayoutGrid,
  connectors: Blocks,
  plans: CreditCard,
  general: UserRound,
  appearance: Palette,
};

function navLabel(id: SidebarNavId) {
  if (isExtraNavId(id)) return extraNavLabels[id];
  return spaces.find((item) => item.id === id)?.label;
}

type PinnedItem = {
  kind: "thread" | "project" | "connector";
  id: string;
  title: string;
  tier: PinTier;
  icon?: string;
  spaceId?: SpaceId;
};

export function Sidebar() {
  const {
    product,
    workspace,
    workspacePolicies,
    view,
    spaceId,
    threadId,
    projectId,
    sidebarOpen,
    mobileNav,
    platformNav,
    setPlatformNav,
    setMobileNav,
    newChat,
    openSpace,
    openRecents,
    openBrowser,
    threads,
    pins,
    sidebarLayout,
    reorderPins,
    openThread,
    openProject,
    openConnector,
    connectorId,
    actor,
    billingPlan,
    personalSpaceEnabled,
    entitlements,
    settingsTab,
    setSettingsTab,
    workspaceRailOpen,
  } = useApp();

  const settingsNav = visibleSettingsTabs(entitlements);
  const inSettings = view === "settings";
  const [secondaryOpen, setSecondaryOpen] = useState(false);
  useEffect(() => {
    if (inSettings || product !== "courier") setSecondaryOpen(false);
  }, [inSettings, product]);
  const shellStyle = useShellStyle();
  const floating = shellStyle === "floating";
  const showRail =
    entitlements.hasWorkspaces &&
    !entitlements.showInviteWall &&
    workspaceRailOpen;

  const { main } = resolveSidebarNav(
    memberSpaces(workspace.id, actor.id, workspacePolicies),
    sidebarLayout,
    { billingPlan, personalEnabled: personalSpaceEnabled },
  );
  const chatActive =
    view === "chat" && !threadId && !spaceId && product === "courier";

  const pinnedItems: PinnedItem[] = [];
  for (const pin of pins) {
    const tier: PinTier =
      pin.tier === "secondary" ? "secondary" : "primary";
    if (pin.kind === "connector") {
      const connector = connectors.find((item) => item.id === pin.id);
      if (connector) {
        pinnedItems.push({
          kind: "connector",
          id: connector.id,
          title: connector.name,
          icon: connector.icon,
          tier,
        });
      }
      continue;
    }
    if (pin.kind === "thread") {
      const thread = threads.find(
        (item) =>
          item.id === pin.id &&
          item.workspaceId === workspace.id &&
          (item.product ?? "courier") === "courier",
      );
      if (thread) {
        pinnedItems.push({
          kind: "thread",
          id: thread.id,
          title: thread.title,
          spaceId: thread.spaceId,
          tier,
        });
      }
      continue;
    }
    const project = projects.find(
      (item) => item.id === pin.id && item.workspaceId === workspace.id,
    );
    if (project) {
      pinnedItems.push({
        kind: "project",
        id: project.id,
        title: project.name,
        spaceId: project.space,
        tier,
      });
    }
  }

  const primaryItems = pinnedItems.filter((item) => item.tier === "primary");
  const secondaryItems = pinnedItems.filter(
    (item) => item.tier === "secondary",
  );

  const navActive = (id: SidebarNavId) => {
    if (id === "recents") return view === "recents";
    if (id === "research" && view === "browser") return true;
    return spaceId === id && (view === "space" || view === "chat");
  };

  const openNav = (id: SidebarNavId) => {
    if (id === "browser") openBrowser();
    else if (id === "recents") openRecents();
    else openSpace(id);
  };

  const NavBtn = ({ id }: { id: SidebarNavId }) => {
    const Icon = navIcon(id);
    const label = navLabel(id);
    if (!label) return null;
    const active = navActive(id);
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
          className="h-3.5 w-3.5 text-muted-foreground"
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
    <div
      className={cn(
        "h-full max-w-[100vw] shrink-0 gap-0",
        mobileNav
          ? "absolute inset-y-0 left-0 z-40 flex lg:hidden"
          : "hidden",
        sidebarOpen ? "lg:static lg:flex lg:max-w-none" : "lg:hidden",
      )}
    >
      <WorkspaceRail />
      <aside
        className={cn(
          "flex w-[min(244px,calc(100vw-3.5rem))] shrink-0 flex-col bg-sidebar text-sidebar-foreground lg:w-[244px]",
          floating
            ? cn(
                "overflow-hidden border border-sidebar-border shadow-[0_1px_2px_oklch(0_0_0/0.04)]",
                SHELL_FLOAT_RADIUS,
                "my-3 mr-3 h-[calc(100%-1.5rem)]",
                !showRail && "ml-3",
                mobileNav && !showRail && "ml-2",
              )
            : "h-full overflow-hidden border-r border-sidebar-border",
        )}
      >
      <WindowChrome />

      <div className="px-2">
        <ProductSwitcher />
      </div>

      {inSettings ? (
        <nav
          className="mt-1 min-h-0 flex-1 overflow-y-auto px-2"
          aria-label="Settings"
        >
          {settingsNav.map((tab) => {
            const Icon = settingsIcons[tab.id];
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setSettingsTab(tab.id);
                  setMobileNav(false);
                }}
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
      ) : product === "platform" ? (
        <nav className="mt-1 min-h-0 flex-1 overflow-y-auto px-2" aria-label="Development">
          {platformNavItems
            .filter((item) => entitlements.platformNavAllowed(item.id))
            .map((item) => {
            const Icon = platformNavIcons[item.id];
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setPlatformNav(item.id);
                  setMobileNav(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left text-[13.5px] transition-colors duration-200",
                  platformNav === item.id
                    ? "bg-sidebar-accent font-medium"
                    : "hover:bg-sidebar-accent",
                )}
              >
                <Icon
                  className="h-3.5 w-3.5 text-muted-foreground"
                  strokeWidth={2}
                />
                {item.label}
              </button>
            );
          })}
        </nav>
      ) : (
        <>
          <nav
            className="mt-1 flex min-h-0 flex-1 flex-col overflow-hidden px-2"
            aria-label="Home"
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
                New chat
              </button>
              {main.map((id) => (
                <NavBtn key={id} id={id} />
              ))}
            </div>

            <div className="relative mt-3 min-h-0 flex-1 overflow-hidden">
              <div className="h-full overflow-y-auto">
                <p className="px-3 pb-1 text-[12px] text-muted-foreground">
                  Primary
                </p>
                {primaryItems.length ? (
                  primaryItems.map(renderPinnedRow)
                ) : (
                  <p className="px-3 py-1.5 text-[12px] text-muted-foreground/70">
                    No primary pins
                  </p>
                )}
              </div>

              <div
                className={cn(
                  "absolute inset-0 z-20 flex flex-col overflow-hidden rounded-t-[14px] border border-b-0 border-sidebar-border bg-sidebar transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
                  secondaryOpen
                    ? "translate-y-0 shadow-[0_-8px_24px_oklch(0_0_0/0.08)]"
                    : "pointer-events-none translate-y-full",
                )}
                aria-hidden={!secondaryOpen}
              >
                <div className="flex shrink-0 items-center gap-2 px-3 pt-2.5 pb-1">
                  <p className="min-w-0 flex-1 text-[12px] text-muted-foreground">
                    Secondary
                  </p>
                  <button
                    type="button"
                    aria-label="Close secondary"
                    onClick={() => setSecondaryOpen(false)}
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-200 hover:bg-sidebar-accent hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={1.8} />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
                  {secondaryItems.length ? (
                    secondaryItems.map(renderPinnedRow)
                  ) : (
                    <p className="px-1 py-1.5 text-[12px] text-muted-foreground/70">
                      Pin secondary items here
                    </p>
                  )}
                </div>
              </div>
            </div>
          </nav>

          {!secondaryOpen ? (
            <div className="relative z-30 flex shrink-0 justify-center px-2 pb-2">
              <button
                type="button"
                aria-expanded={false}
                aria-label="Show secondary pins"
                onClick={() => setSecondaryOpen(true)}
                className="h-8 w-full rounded-[10px] border border-sidebar-border bg-transparent text-[12.5px] font-medium tracking-[-0.01em] text-sidebar-foreground/80 transition-colors duration-200 hover:bg-sidebar-accent hover:text-foreground"
              >
                Secondary
              </button>
            </div>
          ) : null}
        </>
      )}
    </aside>
    </div>
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
