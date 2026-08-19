"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  Globe,
  Hammer,
  Link2,
  MessageSquare,
  Monitor,
  MousePointer2,
  Plus,
  RotateCw,
  Search,
  Share,
  Clapperboard,
  Smartphone,
  Tablet,
  X,
} from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { GoogleHome } from "@/components/browser/GoogleHome";
import { ChatColumn } from "@/components/shell/ChatColumn";
import { NavToggle } from "@/components/shell/NavToggle";
import { SplitHandle } from "@/components/shell/SplitHandle";
import { Dropdown } from "@/components/ui/Controls";
import { cn } from "@/lib/utils";

type BrowserTab = {
  id: string;
  title: string;
  url: string;
};

const seedTabs: BrowserTab[] = [
  { id: "t1", title: "Google", url: "https://www.google.com" },
  { id: "t2", title: "Cander :4100", url: "http://localhost:4100" },
];

export function BrowserLayout() {
  const {
    browserChatOpen,
    setBrowserChatOpen,
    browserChatRatio,
    setBrowserChatRatio,
    sidebarOpen,
    mobileNav,
    setBrowserPage,
  } = useApp();
  const [tabs, setTabs] = useState(seedTabs);
  const [activeId, setActiveId] = useState(seedTabs[0].id);
  const [url, setUrl] = useState(seedTabs[0].url);

  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0];

  useEffect(() => {
    setBrowserPage({ url: active.url, title: active.title });
  }, [active.url, active.title, setBrowserPage]);

  const selectTab = (id: string) => {
    setActiveId(id);
    const tab = tabs.find((item) => item.id === id);
    if (tab) setUrl(tab.url);
  };

  const closeTab = (id: string) => {
    if (tabs.length === 1) return;
    const next = tabs.filter((item) => item.id !== id);
    setTabs(next);
    if (activeId === id) selectTab(next[0].id);
  };

  const addTab = () => {
    const id = `t-${Math.random().toString(36).slice(2, 6)}`;
    const tab = { id, title: "New tab", url: "https://" };
    setTabs((current) => [...current, tab]);
    setActiveId(id);
    setUrl(tab.url);
  };

  const commitUrl = () => {
    setTabs((current) =>
      current.map((item) =>
        item.id === activeId ? { ...item, url, title: tabTitle(url) } : item,
      ),
    );
  };

  return (
    <div
      id="courier-main"
      className="flex min-h-0 min-w-0 flex-1 overflow-hidden"
    >
      {browserChatOpen ? (
        <>
          <div
            className="flex min-h-0 shrink-0 flex-col bg-background transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{
              width: `${browserChatRatio * 100}%`,
              minWidth: "16rem",
              maxWidth: "28rem",
            }}
          >
            <header className="flex h-11 shrink-0 items-center gap-1 bg-background px-2">
              <NavToggle
                className={cn(
                  sidebarOpen && "lg:hidden",
                  mobileNav && "max-lg:hidden",
                )}
              />
              <button
                type="button"
                aria-label="Close chat"
                onClick={() => setBrowserChatOpen(false)}
                className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" strokeWidth={1.6} />
              </button>
            </header>
            <ChatColumn />
          </div>
          <SplitHandle label="Resize chat" onRatio={setBrowserChatRatio} />
        </>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-sidebar transition-[flex] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]">
        <div className="flex h-10 min-w-0 shrink-0 items-center gap-1 bg-sidebar px-2">
          {!browserChatOpen ? (
            <>
              <NavToggle
                className={cn(
                  sidebarOpen && "lg:hidden",
                  mobileNav && "max-lg:hidden",
                )}
              />
              <RailBtn
                label="Open chat"
                onClick={() => setBrowserChatOpen(true)}
              >
                <MessageSquare className="h-3.5 w-3.5" strokeWidth={1.6} />
              </RailBtn>
            </>
          ) : null}
          <TabStrip
            tabs={tabs}
            activeId={activeId}
            onSelect={selectTab}
            onClose={closeTab}
            onAdd={addTab}
          />
        </div>

        <BrowserToolbar
          url={url}
          onUrlChange={setUrl}
          onCommit={commitUrl}
        />
        {isGoogle(active.url) ? (
          <div className="min-h-0 flex-1 overflow-y-auto bg-white">
            <GoogleHome />
          </div>
        ) : (
          <BrowserPage active={active} />
        )}
      </div>
    </div>
  );
}

function BrowserToolbar({
  url,
  onUrlChange,
  onCommit,
}: {
  url: string;
  onUrlChange: (value: string) => void;
  onCommit: () => void;
}) {
  const { attachBrowserReference, referencePageInSpace } = useApp();

  return (
    <div className="flex h-10 min-w-0 shrink-0 items-center gap-0.5 overflow-visible bg-sidebar px-2">
      <RailBtn label="Back">
        <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.6} />
      </RailBtn>
      <RailBtn label="Forward">
        <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.6} />
      </RailBtn>
      <RailBtn label="Refresh">
        <RotateCw className="h-3.5 w-3.5" strokeWidth={1.6} />
      </RailBtn>

      <input
        value={url}
        onChange={(event) => onUrlChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onCommit();
        }}
        onBlur={onCommit}
        className="mx-1 flex h-7 min-w-0 flex-1 items-center overflow-hidden rounded-lg bg-muted/60 px-2.5 font-mono text-[11.5px] text-muted-foreground outline-none"
      />

      <span className="relative z-20 ml-0.5 flex shrink-0 items-center gap-0.5">
        <RailBtn label="Desktop" active>
          <Monitor className="h-3.5 w-3.5" strokeWidth={1.6} />
        </RailBtn>
        <RailBtn label="Tablet">
          <Tablet className="h-3.5 w-3.5" strokeWidth={1.6} />
        </RailBtn>
        <RailBtn label="Mobile">
          <Smartphone className="h-3.5 w-3.5" strokeWidth={1.6} />
        </RailBtn>
        <RailBtn label="Select element">
          <MousePointer2 className="h-3.5 w-3.5" strokeWidth={1.6} />
        </RailBtn>
        <RailBtn label="Share">
          <Share className="h-3.5 w-3.5" strokeWidth={1.6} />
        </RailBtn>
        <ReferenceMenu
          onAttach={attachBrowserReference}
          onBuild={() => referencePageInSpace("build")}
          onStudio={() => referencePageInSpace("studio")}
          onResearch={() => referencePageInSpace("research")}
        />
      </span>
    </div>
  );
}

function ReferenceMenu({
  onAttach,
  onBuild,
  onStudio,
  onResearch,
}: {
  onAttach: () => void;
  onBuild: () => void;
  onStudio: () => void;
  onResearch: () => void;
}) {
  return (
    <Dropdown
      className="shrink-0"
      menuClassName="w-72 min-w-72 p-1.5"
      align="end"
      matchTrigger={false}
      trigger={({ open, toggle }) => (
        <RailBtn label="More" onClick={toggle} active={open}>
          <Ellipsis className="h-3.5 w-3.5" strokeWidth={1.6} />
        </RailBtn>
      )}
    >
      {(close) => (
        <>
          <p className="px-2.5 pt-1.5 pb-1 text-[11px] tracking-[0.06em] text-muted-foreground uppercase">
            Use this tab
          </p>
          <MenuItem
            icon={Link2}
            title="Attach to chat"
            body="Drop this page into the composer as a reference."
            onClick={() => {
              onAttach();
              close();
            }}
          />
          <div className="my-1.5 mx-2 h-px bg-foreground/12" />
          <MenuItem
            icon={Hammer}
            title="Use in Build"
            body="Open a new Build chat with this page attached."
            tint="text-sky-400"
            onClick={() => {
              onBuild();
              close();
            }}
          />
          <MenuItem
            icon={Clapperboard}
            title="Use in Studio"
            body="Send this page into Studio as visual reference."
            tint="text-violet-400"
            onClick={() => {
              onStudio();
              close();
            }}
          />
          <MenuItem
            icon={Search}
            title="Use in Research"
            body="Save this tab as a source in Research."
            tint="text-orange-400"
            onClick={() => {
              onResearch();
              close();
            }}
          />
        </>
      )}
    </Dropdown>
  );
}

function MenuItem({
  title,
  body,
  onClick,
  icon: Icon,
  tint,
}: {
  title: string;
  body: string;
  onClick: () => void;
  icon: typeof Link2;
  tint?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-start gap-3 rounded-[10px] px-2.5 py-2.5 text-left transition-colors duration-200 hover:bg-muted"
    >
      <Icon
        className={cn("mt-0.5 h-4 w-4 shrink-0", tint ?? "text-muted-foreground")}
        strokeWidth={1.6}
      />
      <span className="min-w-0">
        <span className="block text-[13.5px] font-medium tracking-[-0.01em]">
          {title}
        </span>
        <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">
          {body}
        </span>
      </span>
    </button>
  );
}

function BrowserPage({ active }: { active: BrowserTab }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-background">
      <div className="mx-auto max-w-3xl px-8 py-16">
        <p className="font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase">
          {active.url}
        </p>
        <h1 className="heading-display mt-3 text-[2rem]">{active.title}</h1>
        <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
          Browser mode is a dedicated surface for real web work — tabs up top,
          pages front and center, chat on the left for navigation and actions.
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {[
            "Compare pricing pages side by side",
            "Save sources straight into Research",
            "Fill checkout flows with test data",
            "Watch a signup funnel end to end",
          ].map((item) => (
            <div
              key={item}
              className="rounded-[10px] border border-border bg-card px-4 py-3 text-[13.5px]"
            >
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TabStrip({
  tabs,
  activeId,
  onSelect,
  onClose,
  onAdd,
}: {
  tabs: BrowserTab[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onSelect(tab.id)}
          className={cn(
            "group inline-flex h-7 max-w-[14rem] shrink-0 items-center gap-1.5 rounded-lg px-2 text-[12px] tracking-[-0.01em] transition-colors duration-200",
            tab.id === activeId
              ? "bg-sidebar-accent text-foreground"
              : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
          )}
        >
          {isGoogle(tab.url) ? (
            <GoogleMark />
          ) : (
            <Globe className="h-3.5 w-3.5 shrink-0" strokeWidth={1.6} />
          )}
          <span className="truncate">{tab.title}</span>
          {tabs.length > 1 ? (
            <span
              role="button"
              tabIndex={0}
              aria-label={`Close ${tab.title}`}
              onClick={(event) => {
                event.stopPropagation();
                onClose(tab.id);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  onClose(tab.id);
                }
              }}
              className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted"
            >
              <X className="h-2.5 w-2.5" strokeWidth={2} />
            </span>
          ) : null}
        </button>
      ))}
      <RailBtn label="New tab" onClick={onAdd}>
        <Plus className="h-3.5 w-3.5" strokeWidth={1.8} />
      </RailBtn>
    </div>
  );
}

function RailBtn({
  label,
  active,
  children,
  onClick,
}: {
  label: string;
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-lg px-1.5 text-muted-foreground transition-colors duration-200 hover:bg-sidebar-accent hover:text-foreground",
        active && "bg-sidebar-accent text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function GoogleMark() {
  return (
    <span
      aria-hidden
      className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[11px] font-medium leading-none"
    >
      <span className="bg-gradient-to-br from-[#4285F4] via-[#34A853] to-[#EA4335] bg-clip-text text-transparent">
        G
      </span>
    </span>
  );
}

function tabTitle(url: string) {
  try {
    const parsed = new URL(url);
    if (isGoogle(url)) return "Google";
    if (parsed.hostname === "localhost" && parsed.port) {
      return `Preview :${parsed.port}`;
    }
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "New tab";
  }
}

function isGoogle(url: string) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host === "google.com" || host.endsWith(".google.com");
  } catch {
    return false;
  }
}
