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
  ImageIcon,
  Mic,
  Paperclip,
  Plus,
} from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { connectors } from "@/lib/data";
import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import {
  isSpaceLibrarySpace,
  spaceLibraryLabel,
} from "@/lib/space-library";
import { isChatSpace } from "@/lib/spaces";
import { labelFor } from "@/lib/build-loop";
import { cn } from "@/lib/utils";

type MenuId = "plus" | null;

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
    armChatInterface,
    collapseDraft,
    thread,
    drafting,
    selectedId,
    toggleSpaceLibrary,
    spaceLibraryOpen,
    attachBrowserReference,
    pageReference,
    clearPageReference,
    entitlements,
  } = useApp();
  const [value, setValue] = useState("");
  const [menu, setMenu] = useState<MenuId>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [listening, setListening] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const LINE_HEIGHT = 20;
  const MAX_LINES = 10;
  const MIN_HEIGHT = 32;

  useEffect(() => {
    const el = textRef.current;
    if (!el || compact) return;

    const resize = () => {
      // Empty: always one line. Avoids the space-slide animation measuring
      // the placeholder at ~0 width and locking the box at max height.
      if (!value) {
        el.style.height = `${MIN_HEIGHT}px`;
        el.style.overflowY = "hidden";
        return;
      }
      const max = LINE_HEIGHT * MAX_LINES + 12;
      el.style.height = "auto";
      const scroll = el.scrollHeight;
      el.style.height = `${Math.min(Math.max(scroll, MIN_HEIGHT), max)}px`;
      el.style.overflowY = scroll > max ? "auto" : "hidden";
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [value, compact]);

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
    const refPrefix = pageReference
      ? `[ref: ${pageReference.title} — ${pageReference.url}] `
      : "";
    onSend(`${refPrefix}${value}`);
    setValue("");
    setListening(false);
    setElapsed(0);
    setMenu(null);
    clearPageReference();
  };

  const clock =
    `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;

  const stayInPlace = compact || hideSpaceTools;
  const hint =
    placeholder ??
    (activeConnector
      ? `Ask about ${activeConnector.name}…`
      : selectedId && !stayInPlace
        ? `Change the ${labelFor(selectedId)}…`
        : "Describe what you want…");

  const toggleListening = () => {
    setListening((on) => {
      if (on) setElapsed(0);
      return !on;
    });
  };

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
            <MenuBtn
              onClick={() => {
                fileRef.current?.click();
                setMenu(null);
              }}
            >
              <Paperclip className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.6} />
              Upload file
            </MenuBtn>
            <MenuBtn
              onClick={() => {
                imageRef.current?.click();
                setMenu(null);
              }}
            >
              <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.6} />
              Add image
            </MenuBtn>
            {entitlements.hasVoice ? (
              <MenuBtn
                active={listening}
                onClick={() => {
                  toggleListening();
                  setMenu(null);
                }}
              >
                <Mic
                  className={cn(
                    "h-3.5 w-3.5",
                    listening ? "text-foreground" : "text-muted-foreground",
                  )}
                  strokeWidth={1.6}
                />
                {listening ? "Stop dictation" : "Voice dictation"}
              </MenuBtn>
            ) : null}
            {browserMode ? (
              <MenuBtn
                onClick={() => {
                  attachBrowserReference();
                  setMenu(null);
                }}
              >
                <Link2 className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.6} />
                Attach page
              </MenuBtn>
            ) : null}
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
                onClick={toggleListening}
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
          <div className="rounded-[20px] border border-border bg-muted py-1.5 pr-[18px] pl-3">
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
            {activeConnector || showLibrary ? (
              <div className="mb-1 flex min-w-0 items-center gap-1">
                {activeConnector ? (
                  <span
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-muted/70 ring-2 ring-border"
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
                      "inline-flex h-7 items-center rounded-lg px-2 text-[12px] font-medium tracking-[-0.01em] transition-colors duration-200",
                      spaceLibraryOpen
                        ? "bg-background text-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {spaceLibraryLabel(spaceId)}
                  </button>
                ) : null}
              </div>
            ) : null}
            <div
              className={cn(
                "flex gap-1",
                // Desktop landing: grow down with + / send fixed at the top.
                // Mobile + docked chat: center on one line; lock to bottom when taller.
                landing
                  ? "items-start max-md:items-end"
                  : value
                    ? "items-end"
                    : "items-center",
              )}
            >
              <ToolBtn
                label="Add"
                active={menu === "plus" || listening}
                onClick={() => toggleMenu("plus")}
              >
                <Plus className="h-4 w-4" strokeWidth={1.7} />
              </ToolBtn>
              <textarea
                ref={textRef}
                value={value}
                rows={1}
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
                className="h-8 max-h-[212px] min-h-8 min-w-0 flex-1 resize-none overflow-y-hidden bg-transparent py-1.5 text-[14px] leading-5 outline-none placeholder:text-muted-foreground"
              />
              {listening ? (
                <div
                  className={cn(
                    "mr-0.5 flex shrink-0 items-center gap-2",
                    landing ? "mt-1.5 max-md:mt-0 max-md:mb-1.5" : null,
                  )}
                >
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
              <button
                type="submit"
                aria-label="Send"
                className="inline-flex h-[28.5px] w-[28.5px] shrink-0 self-center items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors duration-200 hover:bg-foreground"
              >
                <ArrowUp className="h-3.5 w-3.5" strokeWidth={2.25} />
              </button>
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
      className="absolute inset-x-0 bottom-[calc(100%+8px)] z-40 max-h-[min(24rem,50vh)] overflow-y-auto rounded-[20px] border border-border bg-muted p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.12)]"
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
        "flex w-full items-center gap-2.5 rounded-[14px] px-2.5 py-2 text-left text-[13.5px] transition-colors duration-200 hover:bg-background",
        active && "bg-background",
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
        "inline-flex shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-background hover:text-foreground",
        size === "sm" ? "h-7 w-7" : "h-8 w-8",
        active && "bg-background text-foreground",
      )}
    >
      {children}
    </button>
  );
}
