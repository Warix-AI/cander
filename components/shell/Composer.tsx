"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Link2,
  ArrowUp,
  Blocks,
  Bug,
  Check,
  ChevronRight,
  Globe,
  Hexagon,
  ImageIcon,
  Layers2,
  MessageCircleQuestion,
  Mic,
  Paperclip,
  Plus,
  Search,
  Sparkle,
  Waypoints,
} from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { connectors, spaces } from "@/lib/data";
import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import { spaceIconTint, spaceIcons } from "@/lib/space-icons";
import {
  isSpaceLibrarySpace,
  spaceLibraryLabel,
} from "@/lib/space-library";
import { isChatSpace, spaceAllowed } from "@/lib/spaces";
import { labelFor } from "@/lib/build-loop";
import { cn } from "@/lib/utils";
import { memberSpaces, blockedConnectorIds } from "@/lib/workspace-policy";

type MenuId = "plus" | null;
type PlusPage = "root" | "connectors" | "space";
type ChatMode = "plan" | "debug" | "multitask" | "ask";

const modes: {
  id: ChatMode;
  label: string;
  body: string;
  icon: typeof Waypoints;
  tint: string;
}[] = [
  {
    id: "plan",
    label: "Plan",
    body: "Generate an implementation plan",
    icon: Waypoints,
    tint: "text-orange-400",
  },
  {
    id: "debug",
    label: "Debug",
    body: "Pinpoint the root cause of an issue",
    icon: Bug,
    tint: "text-rose-400",
  },
  {
    id: "multitask",
    label: "Multitask",
    body: "Orchestrate multiple subagents in parallel",
    icon: Layers2,
    tint: "text-violet-400",
  },
  {
    id: "ask",
    label: "Ask",
    body: "Answer questions without making edits",
    icon: MessageCircleQuestion,
    tint: "text-emerald-400",
  },
];

export function Composer({
  onSend,
  landing = false,
  compact = false,
  hideSpaceTools = false,
  placeholder,
  onFocus,
  autoFocus = false,
}: {
  onSend: (text: string) => void;
  landing?: boolean;
  compact?: boolean;
  hideSpaceTools?: boolean;
  placeholder?: string;
  onFocus?: () => void;
  autoFocus?: boolean;
}) {
  const {
    spaceId,
    connectorId,
    view,
    setChatSpace,
    openConnector,
    armChatInterface,
    collapseDraft,
    thread,
    drafting,
    workspaceId,
    workspacePolicies,
    selectedId,
    toggleSpaceLibrary,
    spaceLibraryOpen,
    browserPage,
    attachBrowserReference,
    referencePageInSpace,
    pageReference,
    clearPageReference,
    billingPlan,
    personalSpaceEnabled,
    openBrowser,
    actor,
    entitlements,
  } = useApp();
  const allowedConnectors = connectors.filter(
    (item) =>
      !blockedConnectorIds(
        workspaceId,
        workspacePolicies,
        billingPlan,
      ).includes(item.id),
  );
  const allowedSpaces = memberSpaces(
    workspaceId,
    actor.id,
    workspacePolicies,
  );
  const chatSpaces = spaces.filter(
    (space) =>
      isChatSpace(space.id) &&
      spaceAllowed(space.id, allowedSpaces, {
        billingPlan,
        personalEnabled: personalSpaceEnabled,
      }),
  );
  const [value, setValue] = useState("");
  const [menu, setMenu] = useState<MenuId>(null);
  const [plusPage, setPlusPage] = useState<PlusPage>("root");
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<ChatMode | null>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [listening, setListening] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onPointer = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setMenu(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(null);
    };
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const toggleMenu = (id: MenuId) => {
    setMenu((current) => (current === id ? null : id));
    setQuery("");
    setPlusPage("root");
  };

  const browserMode = view === "browser";
  const activeConnector =
    connectorId && spaceId === "connectors"
      ? connectors.find((item) => item.id === connectorId)
      : null;
  const showLibrary =
    !!spaceId &&
    isSpaceLibrarySpace(spaceId) &&
    !thread &&
    !drafting &&
    !compact &&
    !hideSpaceTools;

  useEffect(() => {
    if (menu !== "plus") return;
    const id = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [menu]);

  useEffect(() => {
    if (!listening) return;
    const id = window.setInterval(() => setElapsed((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [listening]);

  useEffect(() => {
    if (entitlements.hasVoice) return;
    setListening(false);
    setElapsed(0);
  }, [entitlements.hasVoice]);

  const submit = () => {
    const prefix = mode ? `[${mode}] ` : "";
    const refPrefix = pageReference
      ? `[ref: ${pageReference.title} — ${pageReference.url}] `
      : "";
    onSend(`${prefix}${refPrefix}${value}`);
    setValue("");
    setMode(null);
    setListening(false);
    setElapsed(0);
    setMenu(null);
    clearPageReference();
  };

  const clock =
    `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;

  const needle = query.trim().toLowerCase();
  const visibleModes = modes.filter(
    (item) =>
      !needle ||
      item.label.toLowerCase().includes(needle) ||
      item.body.toLowerCase().includes(needle),
  );
  const stayInPlace = compact || hideSpaceTools;
  const hint =
    placeholder ??
    (activeConnector
      ? `Ask about ${activeConnector.name}…`
      : selectedId && !stayInPlace
        ? `Change the ${labelFor(selectedId)}…`
        : "Describe what you want…");
  const tools = [
    { id: "files" as const, hit: "files attach upload" },
    { id: "image" as const, hit: "image photo picture attach" },
    { id: "model" as const, hit: "model auto" },
    ...(!hideSpaceTools
      ? [
          { id: "connectors" as const, hit: "connectors mcp" },
          {
            id: "space" as const,
            hit: "space build studio research tasks skills auto",
          },
        ]
      : []),
  ].filter((item) => !needle || item.hit.includes(needle));
  const browserTools = browserMode
    ? [
        { id: "attach-ref" as const, hit: "reference attach page tab" },
        { id: "build-ref" as const, hit: "build reference" },
        { id: "studio-ref" as const, hit: "studio reference edit" },
        { id: "research-ref" as const, hit: "research reference source" },
        { id: "discuss-ref" as const, hit: "discuss chat talk page" },
      ].filter((item) => !needle || item.hit.includes(needle))
    : [];

  return (
    <form
      className={compact || landing ? "w-full" : "px-4 pb-4"}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div
        ref={wrapRef}
        className={cn(
          "relative mx-auto",
          landing || compact ? "max-w-none" : "max-w-[38rem]",
          !stayInPlace && "composer-dock",
        )}
      >
        {menu === "plus" && !compact ? (
          <ComposerMenu>
            {plusPage === "connectors" ? (
              <>
                <button
                  type="button"
                  onClick={() => setPlusPage("root")}
                  className="mb-1 px-2 py-1.5 text-left text-[12px] text-muted-foreground hover:text-foreground"
                >
                  ← Connectors
                </button>
                {allowedConnectors.length ? (
                  allowedConnectors.map((item) => (
                    <MenuBtn
                      key={item.id}
                      onClick={() => {
                        openConnector(item.id);
                        setMenu(null);
                      }}
                    >
                      <ConnectorMark id={item.icon} size="sm" />
                      <span className="min-w-0 flex-1 truncate">{item.name}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {item.accounts.length}
                      </span>
                    </MenuBtn>
                  ))
                ) : (
                  <p className="px-2 py-2 text-[12.5px] text-muted-foreground">
                    No connectors allowed in this workspace.
                  </p>
                )}
              </>
            ) : plusPage === "space" ? (
              <>
                <button
                  type="button"
                  onClick={() => setPlusPage("root")}
                  className="mb-1 px-2 py-1.5 text-left text-[12px] text-muted-foreground hover:text-foreground"
                >
                  ← Space
                </button>
                <MenuBtn
                  active={!spaceId}
                  onClick={() => {
                    setChatSpace(null);
                    collapseDraft();
                    setMenu(null);
                  }}
                >
                  Auto
                  <span className="ml-auto text-[12px] text-muted-foreground">
                    Infer from the prompt
                  </span>
                </MenuBtn>
                {chatSpaces.map((space) => {
                  const Icon = spaceIcons[space.id];
                  return (
                    <MenuBtn
                      key={space.id}
                      active={spaceId === space.id}
                      onClick={() => {
                        setChatSpace(space.id);
                        if (value.trim() && !landing) armChatInterface(space.id);
                        setMenu(null);
                      }}
                    >
                      <Icon className={cn("h-3.5 w-3.5", spaceIconTint(space.id))} strokeWidth={1.6} />
                      <span className="flex-1">{space.label}</span>
                      {spaceId === space.id ? (
                        <Check className="h-3.5 w-3.5" strokeWidth={1.75} />
                      ) : null}
                    </MenuBtn>
                  );
                })}
              </>
            ) : (
              <>
                <div className="relative mb-1.5">
                  <Search
                    className="pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                    strokeWidth={1.6}
                  />
                  <input
                    ref={searchRef}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search tasks, context, chats..."
                    className="h-9 w-full rounded-lg bg-transparent pr-3 pl-8 text-[13px] outline-none placeholder:text-muted-foreground"
                  />
                </div>
                {browserMode ? (
                  <>
                    <p className="px-2 py-1.5 text-[11px] tracking-[0.06em] text-muted-foreground uppercase">
                      Current tab
                    </p>
                    <p className="px-2 pb-2 font-mono text-[11.5px] text-muted-foreground">
                      {browserPage.url}
                    </p>
                    {browserTools.some((item) => item.id === "attach-ref") ? (
                      <MenuBtn
                        onClick={() => {
                          attachBrowserReference();
                          setMenu(null);
                        }}
                      >
                        <Link2 className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.6} />
                        <span className="flex-1">Attach as reference</span>
                      </MenuBtn>
                    ) : null}
                    {browserTools.some((item) => item.id === "discuss-ref") ? (
                      <MenuBtn
                        onClick={() => {
                          setValue(
                            (current) =>
                              `${current}${current ? " " : ""}Let's discuss ${browserPage.title} (${browserPage.url})`,
                          );
                          setMenu(null);
                        }}
                      >
                        <MessageCircleQuestion className="h-3.5 w-3.5 text-emerald-400" strokeWidth={1.6} />
                        <span className="flex-1">Discuss in chat</span>
                      </MenuBtn>
                    ) : null}
                    {browserTools.some((item) => item.id === "build-ref") ? (
                      <MenuBtn
                        onClick={() => {
                          referencePageInSpace("build");
                          setMenu(null);
                        }}
                      >
                        <Sparkle className="h-3.5 w-3.5 text-sky-400" strokeWidth={1.6} />
                        <span className="flex-1">Use as reference in Build</span>
                      </MenuBtn>
                    ) : null}
                    {browserTools.some((item) => item.id === "studio-ref") ? (
                      <MenuBtn
                        onClick={() => {
                          referencePageInSpace("studio");
                          setMenu(null);
                        }}
                      >
                        <Sparkle className="h-3.5 w-3.5 text-violet-400" strokeWidth={1.6} />
                        <span className="flex-1">Use as reference in Studio</span>
                      </MenuBtn>
                    ) : null}
                    {browserTools.some((item) => item.id === "research-ref") ? (
                      <MenuBtn
                        onClick={() => {
                          referencePageInSpace("research");
                          setMenu(null);
                        }}
                      >
                        <Sparkle className="h-3.5 w-3.5 text-amber-400" strokeWidth={1.6} />
                        <span className="flex-1">Use as reference in Research</span>
                      </MenuBtn>
                    ) : null}
                    <div className="my-1.5 mx-2 h-[0.5px] bg-foreground/12" />
                  </>
                ) : null}
                {!browserMode
                  ? visibleModes.map((item) => {
                  const Icon = item.icon;
                  return (
                    <MenuBtn
                      key={item.id}
                      active={mode === item.id}
                      onClick={() => {
                        setMode(item.id);
                        setMenu(null);
                      }}
                    >
                      <Icon className={cn("h-3.5 w-3.5", item.tint)} strokeWidth={1.7} />
                      <span className="font-medium">{item.label}</span>
                      <span className="min-w-0 flex-1 truncate text-right text-[12px] text-muted-foreground">
                        {item.body}
                      </span>
                    </MenuBtn>
                  );
                })
                  : null}
                {tools.length ? (
                  <div className="my-1.5 mx-2 h-[0.5px] bg-foreground/12" />
                ) : null}
                {tools.some((item) => item.id === "files") ? (
                  <MenuBtn
                    onClick={() => {
                      fileRef.current?.click();
                      setMenu(null);
                    }}
                  >
                    <Paperclip className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.6} />
                    Upload file
                  </MenuBtn>
                ) : null}
                {tools.some((item) => item.id === "image") ? (
                  <MenuBtn
                    onClick={() => {
                      imageRef.current?.click();
                      setMenu(null);
                    }}
                  >
                    <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.6} />
                    Add image
                  </MenuBtn>
                ) : null}
                {tools.some((item) => item.id === "model") ? (
                  <MenuBtn onClick={() => setMenu(null)}>
                    <Hexagon className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.6} />
                    <span className="flex-1">Model</span>
                    <span className="text-[12px] text-muted-foreground">Auto</span>
                  </MenuBtn>
                ) : null}
                {tools.some((item) => item.id === "connectors") ? (
                  <MenuBtn onClick={() => setPlusPage("connectors")}>
                    <Blocks className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.6} />
                    <span className="flex-1">Connectors</span>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.6} />
                  </MenuBtn>
                ) : null}
                {tools.some((item) => item.id === "space") ? (
                  <MenuBtn onClick={() => setPlusPage("space")}>
                    {spaceId && isChatSpace(spaceId) ? (
                      (() => {
                        const Icon = spaceIcons[spaceId];
                        return (
                          <Icon
                            className={cn("h-3.5 w-3.5", spaceIconTint(spaceId))}
                            strokeWidth={1.6}
                          />
                        );
                      })()
                    ) : (
                      <Sparkle className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.6} />
                    )}
                    <span className="flex-1">Space</span>
                    <span className="text-[12px] text-muted-foreground">
                      {spaceId
                        ? chatSpaces.find((space) => space.id === spaceId)?.label
                        : "Auto"}
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.6} />
                  </MenuBtn>
                ) : null}
                {!visibleModes.length && !tools.length ? (
                  <p className="px-2 py-3 text-[12.5px] text-muted-foreground">
                    No matches.
                  </p>
                ) : null}
              </>
            )}
          </ComposerMenu>
        ) : null}

        {compact ? (
          <div className="flex h-9 items-center gap-1 rounded-[20px] border border-border bg-muted py-0 pr-1 pl-3">
            <textarea
              value={value}
              rows={1}
              placeholder={hint}
              autoFocus={autoFocus}
              onFocus={onFocus}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
              className="h-7 min-w-0 flex-1 resize-none bg-transparent py-1 text-[14px] leading-5 outline-none placeholder:text-muted-foreground"
            />
            {entitlements.hasVoice ? (
            <ToolBtn
              size="sm"
              label={listening ? "Stop dictation" : "Voice dictation"}
              active={listening}
              onClick={() => {
                setListening((on) => {
                  if (on) setElapsed(0);
                  return !on;
                });
              }}
            >
              <Mic className="h-3.5 w-3.5" strokeWidth={1.6} />
            </ToolBtn>
            ) : null}
            <button
              type="submit"
              aria-label="Send"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors duration-200 hover:bg-foreground"
            >
              <ArrowUp className="h-3.5 w-3.5" strokeWidth={2.25} />
            </button>
          </div>
        ) : (
        <div className="rounded-[20px] border border-border bg-muted px-3 py-2">
          {files.length ? (
            <div className="mb-1.5 flex flex-wrap gap-1.5">
              {files.map((name) => (
                <span
                  key={name}
                  className="inline-flex items-center rounded-lg bg-muted px-2 py-1 font-mono text-[11px]"
                >
                  {name}
                </span>
              ))}
            </div>
          ) : null}
          {selectedId && !stayInPlace ? (
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <span className="rounded-full bg-muted px-2.5 py-1 text-[11.5px] font-medium">
                {labelFor(selectedId)}
              </span>
              {["Make this smaller", "Move this higher", "Redesign this"].map(
                (label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => onSend(label)}
                    className="rounded-full px-2.5 py-1 text-[11.5px] text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    {label}
                  </button>
                ),
              )}
            </div>
          ) : null}
          {pageReference ? (
            <div className="mb-1.5 flex items-center gap-1.5">
              <span className="inline-flex min-w-0 flex-1 items-center gap-1.5 rounded-lg bg-background px-2.5 py-1.5 text-[11.5px]">
                <Link2 className="h-3 w-3 shrink-0 text-muted-foreground" strokeWidth={1.6} />
                <span className="truncate font-medium">{pageReference.title}</span>
                <span className="truncate font-mono text-muted-foreground">
                  {pageReference.url}
                </span>
              </span>
              <button
                type="button"
                aria-label="Remove reference"
                onClick={clearPageReference}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-background hover:text-foreground"
              >
                ×
              </button>
            </div>
          ) : null}
          <textarea
            value={value}
            rows={2}
            placeholder={hint}
            autoFocus={autoFocus}
            onFocus={onFocus}
            onChange={(event) => {
              const next = event.target.value;
              setValue(next);
              if (landing || stayInPlace) return;
              if (next.trim() && isChatSpace(spaceId)) {
                armChatInterface(spaceId);
              } else if (!next.trim() && !thread) {
                collapseDraft();
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "/" && value === "" && !event.metaKey && !event.ctrlKey) {
                event.preventDefault();
                toggleMenu("plus");
                return;
              }
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            className="w-full resize-none bg-transparent pt-1 text-[14px] leading-relaxed outline-none placeholder:text-muted-foreground"
          />
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1">
              <ToolBtn
                label="Add"
                active={menu === "plus"}
                onClick={() => toggleMenu("plus")}
              >
                <Plus className="h-4 w-4" strokeWidth={1.7} />
              </ToolBtn>
              {view !== "browser" ? (
                <ToolBtn
                  label="Browser"
                  active={false}
                  onClick={() => {
                    const query = value.trim();
                    openBrowser({ chat: true, query: query || undefined });
                    if (query) setValue("");
                    setMenu(null);
                  }}
                >
                  <Globe className="h-4 w-4" strokeWidth={1.7} />
                </ToolBtn>
              ) : null}
              {activeConnector ? (
                <span
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-muted/70 ring-2 ring-border"
                  title={`${activeConnector.name} context`}
                  aria-label={`${activeConnector.name} context`}
                >
                  <ConnectorMark id={activeConnector.icon} size="xs" />
                </span>
              ) : null}
              {showLibrary ? (
                <button
                  type="button"
                  onClick={toggleSpaceLibrary}
                  className={cn(
                    "inline-flex h-8 items-center rounded-lg px-2.5 text-[12.5px] font-medium tracking-[-0.01em] transition-colors duration-200",
                    spaceLibraryOpen
                      ? "bg-muted/70 text-foreground ring-2 ring-sky-400/90"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {spaceLibraryLabel(spaceId)}
                </button>
              ) : null}
              {mode ? (
                <span className="truncate rounded-lg bg-muted px-2 py-1 text-[11.5px] font-medium">
                  {modes.find((item) => item.id === mode)?.label}
                </span>
              ) : null}
            </div>

            <div className="flex items-center gap-1">
              {listening ? (
                <div className="mr-1 flex items-center gap-2">
                  <div className="flex h-4 items-end gap-[2px]">
                    {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                      <span
                        key={i}
                        className="voice-bar w-[2px] rounded-full bg-foreground"
                        style={{
                          height: 14,
                          animationDelay: `${i * 90}ms`,
                        }}
                      />
                    ))}
                  </div>
                  <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                    {clock}
                  </span>
                </div>
              ) : null}
              {entitlements.hasVoice ? (
              <ToolBtn
                label={listening ? "Stop dictation" : "Voice dictation"}
                active={listening}
                onClick={() => {
                  setListening((on) => {
                    if (on) setElapsed(0);
                    return !on;
                  });
                }}
              >
                <Mic className="h-4 w-4" strokeWidth={1.6} />
              </ToolBtn>
              ) : null}
              <button
                type="submit"
                aria-label="Send"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors duration-200 hover:bg-foreground"
              >
                <ArrowUp className="h-4 w-4" strokeWidth={2.25} />
              </button>
            </div>
          </div>
        </div>
        )}

        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            const next = [...(event.target.files ?? [])].map((file) => file.name);
            setFiles((current) => [...current, ...next].slice(0, 6));
            event.target.value = "";
          }}
        />
        <input
          ref={imageRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            const next = [...(event.target.files ?? [])].map((file) => file.name);
            setFiles((current) => [...current, ...next].slice(0, 6));
            event.target.value = "";
          }}
        />
      </div>
    </form>
  );
}

function ComposerMenu({ children }: { children: ReactNode }) {
  return (
    <div
      role="menu"
      className="absolute inset-x-0 bottom-[calc(100%+8px)] z-40 max-h-[min(24rem,50vh)] overflow-y-auto rounded-lg border border-border bg-background p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.12)]"
    >
      {children}
    </div>
  );
}

function MenuBtn({
  children,
  onClick,
  active,
}: {
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] transition-colors duration-200 hover:bg-muted",
        active && "bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function ToolBtn({
  children,
  label,
  onClick,
  active,
  size = "md",
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  size?: "md" | "sm";
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground",
        size === "sm" ? "h-7 w-7" : "h-8 w-8",
        active && "bg-muted text-foreground",
      )}
    >
      {children}
    </button>
  );
}
