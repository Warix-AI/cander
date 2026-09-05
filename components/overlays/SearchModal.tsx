"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Blocks,
  FileText,
  Files,
  Hammer,
  History,
  Search,
  Sparkles,
  SquarePen,
} from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { NativeOverlayGate } from "@/components/browser/NativeOverlayGate";
import { Modal } from "@/components/ui/Modal";
import {
  connectors,
  spaces,
} from "@/lib/data";
import { getChatThreads } from "@/lib/api/chat-store";
import {
  openIndexEntry,
  useSpaceIndex,
} from "@/lib/hooks/use-space-index";
import { QuerySkeleton } from "@/lib/hooks/space-query-ui";
import { isNavVisible, SHOW_STUDIO_NAV, spaceAllowed } from "@/lib/spaces";
import { memberSpaces } from "@/lib/workspace-policy";
import { cn } from "@/lib/utils";

type Hit = {
  id: string;
  title: string;
  meta: string;
  group: string;
  run: () => void;
};

export function SearchModal() {
  const {
    overlay,
    closeOverlay,
    workspaceId,
    openSpace,
    openProject,
    openConnector,
    openThread,
    openRecents,
    openBrowser,
    standaloneBrowserOpen,
    newChat,
    view,
    browserPage,
    attachBrowserReference,
    openSpaceEntity,
    billingPlan,
    workspacePolicies,
    openSettings,
    actor,
    entitlements,
  } = useApp();
  const open = overlay === "search";
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const needle = query.trim();

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

  const hits = useMemo(() => {
    const match = (value: string) =>
      !needle || value.toLowerCase().includes(needle.toLowerCase());
    const items: Hit[] = [];

    const actions: Hit[] = [
      {
        id: "action-new-chat",
        title: "New",
        meta: "Start in Chat",
        group: "Actions",
        run: () => newChat(),
      },
      {
        id: "action-new-work",
        title: "New Work",
        meta: "Inbox, calendar, customers",
        group: "Actions",
        run: () => newChat("work"),
      },
      {
        id: "action-browser",
        title: "Browser",
        meta: "Open the web",
        group: "Actions",
        run: openBrowser,
      },
      {
        id: "action-plans",
        title: "Plans",
        meta: "Seats and Ultra",
        group: "Actions",
        run: () => openSettings("plans"),
      },
      {
        id: "action-new-create",
        title: "New Canvas chat",
        meta: "Open Canvas with this chat",
        group: "Actions",
        run: () => newChat("studio"),
      },
      ...(SHOW_STUDIO_NAV
        ? [
            {
              id: "action-new-research",
              title: "New search project",
              meta: "Start a search with this chat",
              group: "Actions" as const,
              run: () => newChat("research"),
            },
          ]
        : []),
    ];
    if (standaloneBrowserOpen) {
      actions.unshift({
        id: "action-current-tab",
        title: browserPage.title,
        meta: browserPage.url,
        group: "Actions",
        run: attachBrowserReference,
      });
    }
    for (const action of actions) {
      if (!match(action.title) && !match(action.meta)) continue;
      items.push(action);
    }

    if (!needle) return items;

    for (const space of spaces) {
      if (!isNavVisible(space.id)) continue;
      if (!match(space.label)) continue;
      if (
        !spaceAllowed(
          space.id,
          memberSpaces(workspaceId, actor.id, workspacePolicies),
          { billingPlan },
        )
      ) {
        continue;
      }
      items.push({
        id: `space-${space.id}`,
        title: space.label,
        meta: "Space",
        group: "Spaces",
        run: () => openSpace(space.id),
      });
    }
    if (match("recents")) {
      items.push({
        id: "recents",
        title: "Recents",
        meta: "History",
        group: "Spaces",
        run: openRecents,
      });
    }

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
        run: () => openThread(thread.id),
      });
    }
    return items;
  }, [
    needle,
    entries,
    workspaceId,
    openSpace,
    openProject,
    openConnector,
    openThread,
    openRecents,
    openBrowser,
    standaloneBrowserOpen,
    newChat,
    view,
    browserPage,
    attachBrowserReference,
    openSpaceEntity,
    billingPlan,
    workspacePolicies,
    openSettings,
    actor,
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
        className="flex w-[min(40rem,calc(100vw-2rem))] flex-col"
      >
      <div className="relative border-b border-border">
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
          placeholder="Search"
          className="h-12 w-full bg-transparent pr-4 pl-11 text-[15px] outline-none placeholder:text-muted-foreground"
        />
      </div>
      <div className="max-h-[min(28rem,60vh)] overflow-y-auto p-2">
        {loading && needle.length >= 2 ? (
          <QuerySkeleton rows={3} />
        ) : hits.length ? (
          hits.map((hit, index) => {
            const showGroup = hit.group !== hits[index - 1]?.group;
            return (
              <div key={hit.id}>
                {showGroup ? (
                  <p className="px-2.5 pt-2 pb-1 font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
                    {hit.group}
                  </p>
                ) : null}
                <button
                  type="button"
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(hit)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left",
                    index === active ? "bg-muted" : "hover:bg-muted/70",
                  )}
                >
                  <HitIcon group={hit.group} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] tracking-[-0.02em]">
                      {hit.title}
                    </span>
                    <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                      {hit.meta}
                    </span>
                  </span>
                </button>
              </div>
            );
          })
        ) : (
          <p className="px-3 py-6 text-[13px] text-muted-foreground">
            Nothing matches that search.
          </p>
        )}
      </div>
    </Modal>
    </>
  );
}

function HitIcon({ group }: { group: string }) {
  const className = "h-3.5 w-3.5 shrink-0 text-muted-foreground";
  if (group === "Projects") return <Hammer className={className} strokeWidth={1.6} />;
  if (group === "Sources") return <FileText className={className} strokeWidth={1.6} />;
  if (group === "Files") return <FileText className={className} strokeWidth={1.6} />;
  if (group === "Tasks") return <Sparkles className={className} strokeWidth={1.6} />;
  if (group === "Connectors") return <Blocks className={className} strokeWidth={1.6} />;
  if (group === "Chats" || group === "Work") {
    return <History className={className} strokeWidth={1.6} />;
  }
  if (group === "Spaces") return <Files className={className} strokeWidth={1.6} />;
  if (group === "Actions") return <SquarePen className={className} strokeWidth={1.6} />;
  return <Search className={className} strokeWidth={1.6} />;
}
