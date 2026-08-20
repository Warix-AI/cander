"use client";

import { useRef, useState, type ReactNode } from "react";
import {
  Ellipsis,
  FolderKanban,
  GripVertical,
  MessageSquare,
  Pin,
  SquarePen,
} from "lucide-react";
import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import { AccountMenu } from "@/components/shell/AccountMenu";
import { ProductSwitcher } from "@/components/shell/ProductSwitcher";
import { WindowChrome } from "@/components/shell/WindowChrome";
import { useApp } from "@/components/app/AppProvider";
import { Dropdown } from "@/components/ui/Controls";
import { platformNavItems, projects, spaces, connectors } from "@/lib/data";
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
import type { PinKind, SpaceId } from "@/lib/types";
import { cn } from "@/lib/utils";
import { memberSpaces } from "@/lib/workspace-policy";

function navLabel(id: SidebarNavId) {
  if (isExtraNavId(id)) return extraNavLabels[id];
  return spaces.find((item) => item.id === id)?.label;
}

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
    isPinned,
    togglePin,
    reorderPins,
    openThread,
    openProject,
    openConnector,
    connectorId,
    actor,
    billingPlan,
    personalSpaceEnabled,
    entitlements,
  } = useApp();

  const { main, more } = resolveSidebarNav(
    memberSpaces(workspace.id, actor.id, workspacePolicies),
    sidebarLayout,
    { billingPlan, personalEnabled: personalSpaceEnabled },
  );
  const chatActive =
    view === "chat" && !threadId && !spaceId && product === "courier";

  type PinnedItem = {
    kind: "thread" | "project" | "connector";
    id: string;
    title: string;
    icon?: string;
    spaceId?: SpaceId;
  };

  const pinnedItems: PinnedItem[] = [];
  for (const pin of pins) {
    if (pin.kind === "connector") {
      const connector = connectors.find((item) => item.id === pin.id);
      if (connector) {
        pinnedItems.push({
          kind: "connector",
          id: connector.id,
          title: connector.name,
          icon: connector.icon,
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
      });
    }
  }

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

  const moreActive = more.some(navActive);

  return (
    <aside
      className={cn(
        "h-full w-[244px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
        mobileNav
          ? "absolute inset-y-0 left-0 z-40 flex lg:hidden"
          : "hidden",
        sidebarOpen ? "lg:static lg:flex" : "lg:hidden",
      )}
    >
      <WindowChrome />

      <div className="px-2">
        <ProductSwitcher />
      </div>

      {product === "platform" ? (
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
        <nav className="mt-1 min-h-0 flex-1 overflow-y-auto px-2" aria-label="Primary">
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
          {more.length ? (
            <MoreMenu items={more} active={moreActive} onOpen={openNav} />
          ) : null}
          {pinnedItems.length ? (
            <div className="pt-3">
              <p className="px-3 pb-1 text-[12px] text-muted-foreground">
                Pinned
              </p>
              {pinnedItems.map((item) => (
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
                  pinned={isPinned(item.kind, item.id)}
                  onOpen={() => {
                    if (item.kind === "thread") openThread(item.id);
                    else if (item.kind === "connector") openConnector(item.id);
                    else openProject(item.id);
                  }}
                  onPin={() => togglePin(item.kind, item.id)}
                  onReorder={reorderPins}
                />
              ))}
            </div>
          ) : null}
        </nav>
      )}

      <div className="mt-auto p-2">
        <AccountMenu />
      </div>
    </aside>
  );
}

function MoreMenu({
  items,
  active,
  onOpen,
}: {
  items: SidebarNavId[];
  active: boolean;
  onOpen: (id: SidebarNavId) => void;
}) {
  return (
    <Dropdown
      className="w-full"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          aria-expanded={open}
          onClick={toggle}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left text-[13.5px] transition-colors duration-200",
            open || active
              ? "bg-sidebar-accent font-medium"
              : "hover:bg-sidebar-accent",
          )}
        >
          <Ellipsis
            className="h-3.5 w-3.5 text-muted-foreground"
            strokeWidth={2}
          />
          More
        </button>
      )}
    >
      {(close) =>
        items.length ? (
          items.map((id) => {
            const Icon = navIcon(id);
            const label = navLabel(id);
            if (!label) return null;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  close();
                  onOpen(id);
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[13.5px] transition-colors duration-200 hover:bg-muted"
              >
                <Icon
                  className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                  strokeWidth={2}
                />
                {label}
              </button>
            );
          })
        ) : (
          <p className="px-3 py-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
            Move sidebar links into More from Configure.
          </p>
        )
      }
    </Dropdown>
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
  pinned,
  onOpen,
  onPin,
  onReorder,
  leading,
}: {
  kind: PinKind;
  id: string;
  title: string;
  active: boolean;
  pinned: boolean;
  onOpen: () => void;
  onPin: () => void;
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
      <button
        type="button"
        aria-label={pinned ? "Unpin" : "Pin"}
        onClick={(event) => {
          event.stopPropagation();
          onPin();
        }}
        className={cn(
          "mr-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-opacity duration-200 hover:text-foreground",
          active
            ? "opacity-100"
            : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
        )}
      >
        <Pin
          className={cn("h-3 w-3", pinned && "fill-current text-foreground")}
          strokeWidth={2}
        />
      </button>
    </div>
  );
}
