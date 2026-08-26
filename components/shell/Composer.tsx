"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Link2,
  ImageIcon,
  Paperclip,
  Pin,
  Plus,
} from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { ComposerUsageBar } from "@/components/shell/ComposerUsageBar";
import {
  LANDING_USAGE_THRESHOLD,
} from "@/lib/hourly-usage";
import { useHourlyUsagePercent } from "@/lib/use-hourly-usage";
import {
  ComposerRecordingView,
  ComposerTrailingActions,
  ComposerVoiceOrb,
} from "@/components/shell/ComposerVoice";
import { connectors } from "@/lib/data";
import { APP_MESSAGE_PLACEHOLDER } from "@/lib/app-brand";
import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import {
  isSpaceLibrarySpace,
  spaceLibraryLabel,
} from "@/lib/space-library";
import { isChatSpace } from "@/lib/spaces";
import { labelFor } from "@/lib/build-loop";
import { useChatCanvasCentered } from "@/lib/chat-layout";
import { useShellStyle } from "@/lib/shell-chrome";
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
    projectId,
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
    voiceActive,
    toggleVoice,
    pinTier,
    setPin,
    clearPin,
  } = useApp();
  const floating = useShellStyle() === "floating";
  const { centered } = useChatCanvasCentered();
  const usagePercent = useHourlyUsagePercent();
  const [value, setValue] = useState("");
  const [dictating, setDictating] = useState(false);
  const [menu, setMenu] = useState<MenuId>(null);
  const [files, setFiles] = useState<string[]>([]);
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

  const stayInPlace = compact || hideSpaceTools;
  const dictatingActive = dictating;
  const hasText = value.trim().length > 0;
  const pinTarget = thread
    ? ({ kind: "thread" as const, id: thread.id })
    : projectId
      ? ({ kind: "project" as const, id: projectId })
      : spaceId === "connectors" && connectorId
        ? ({ kind: "connector" as const, id: connectorId })
        : null;
  const pinned = pinTarget ? Boolean(pinTier(pinTarget.kind, pinTarget.id)) : false;

  const endDictation = () => {
    setDictating(false);
  };

  const stopVoice = () => {
    if (voiceActive) toggleVoice();
  };

  const submit = () => {
    if (dictatingActive && !hasText) {
      endDictation();
      return;
    }
    const refPrefix = pageReference
      ? `[ref: ${pageReference.title} — ${pageReference.url}] `
      : "";
    const payload = `${refPrefix}${value}`.trim();
    if (!payload) return;
    onSend(payload);
    setValue("");
    setMenu(null);
    setDictating(false);
    clearPageReference();
  };

  const startVoice = () => {
    if (!voiceActive) toggleVoice();
  };

  const startDictation = () => {
    setDictating(true);
  };

  const hint =
    placeholder ??
    (activeConnector
      ? `Ask about ${activeConnector.name}…`
      : selectedId && !stayInPlace
        ? `Change the ${labelFor(selectedId)}…`
        : APP_MESSAGE_PLACEHOLDER);

  const showUsageBar =
    !compact && (!landing || usagePercent >= LANDING_USAGE_THRESHOLD);

  return (
    <div className={cn(showUsageBar && "composer-dock-stack")}>
    <form
      className={
        compact
          ? "w-full"
          : landing
            ? "w-full"
            : floating
              ? cn(
                  centered
                    ? "px-4 sm:px-6"
                    : "pr-3 pl-2 sm:pr-4 sm:pl-2.5",
                  showUsageBar ? "pb-0" : "pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4",
                )
              : cn(
                  "px-4 sm:px-6",
                  showUsageBar ? "pb-0" : "pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4",
                )
      }
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div
        ref={wrapRef}
        className={cn(
          "relative w-full",
          landing || compact ? "max-w-none" : "max-w-[38rem]",
          !landing && !compact && (!floating || centered) && "mx-auto",
          !stayInPlace && "composer-dock",
        )}
      >
        {menu === "plus" && !compact ? (
          <ComposerMenu>
            {pinTarget ? (
              <MenuBtn
                onClick={() => {
                  if (pinned) clearPin(pinTarget.kind, pinTarget.id);
                  else setPin(pinTarget.kind, pinTarget.id, "primary");
                  setMenu(null);
                }}
              >
                <Pin
                  className={cn(
                    "h-3.5 w-3.5 text-muted-foreground",
                    pinned && "fill-current",
                  )}
                  strokeWidth={1.6}
                />
                {pinned ? "Unpin" : "Pin"}
              </MenuBtn>
            ) : null}
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

        {voiceActive && !dictatingActive ? (
          <ComposerVoiceOrb compact={compact} />
        ) : null}

        {compact ? (
          <div className="composer-shell py-1.5 pr-1.5 pl-3">
            {dictatingActive ? (
              <ComposerRecordingView
                compact
                onCancel={endDictation}
                onStop={endDictation}
              />
            ) : (
              <div className="flex h-9 items-center gap-0.5">
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
                  className={cn(
                    "min-w-0 flex-1 resize-none bg-transparent text-[14px] outline-none placeholder:text-muted-foreground",
                    hasText ? "h-7 py-1 leading-5" : "h-7 py-0 leading-7",
                  )}
                />
                <ComposerTrailingActions
                  compact
                  hasText={hasText}
                  hasVoice={entitlements.hasVoice}
                  voiceActive={voiceActive}
                  onStartVoice={startVoice}
                  onStopVoice={stopVoice}
                  onStartDictation={startDictation}
                />
              </div>
            )}
          </div>
        ) : (
          <div
            className={cn(
              "composer-shell px-3 py-2 pr-4",
              showUsageBar && "mb-2.5",
            )}
          >
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
            {dictatingActive ? (
              <ComposerRecordingView onCancel={endDictation} onStop={endDictation} />
            ) : (
            <div
              className={cn(
                "flex min-h-8 gap-1",
                !hasText ? "items-center" : "items-end md:items-start",
              )}
            >
              <ToolBtn
                label="Add"
                active={menu === "plus"}
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
                className={cn(
                  "max-h-[212px] min-h-8 min-w-0 flex-1 resize-none overflow-y-hidden bg-transparent text-[14px] outline-none placeholder:text-muted-foreground",
                  hasText ? "h-auto py-1.5 leading-5" : "h-8 py-0 leading-8",
                )}
              />
              <div className="flex shrink-0 items-center gap-0.5 self-end md:self-start">
              <ComposerTrailingActions
                hasText={hasText}
                hasVoice={entitlements.hasVoice}
                voiceActive={voiceActive}
                onStartVoice={startVoice}
                onStopVoice={stopVoice}
                onStartDictation={startDictation}
              />
              </div>
            </div>
            )}
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
        {showUsageBar ? (
          <ComposerUsageBar floating={floating} percent={usagePercent} />
        ) : null}
      </div>
    </form>
    </div>
  );
}

function ComposerMenu({ children }: { children: ReactNode }) {
  return (
    <div
      role="menu"
      className="absolute inset-x-0 bottom-[calc(100%+8px)] z-40 max-h-[min(24rem,50vh)] overflow-y-auto light-surface shell-g3-radius bg-popover p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.08)] dark:bg-transparent"
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
      data-active={active ? "true" : undefined}
      className={cn(
        "menu-row-hover flex w-full items-center gap-2.5 rounded-[14px] px-2.5 py-2 text-left text-[13.5px] transition-colors duration-200",
        active && "font-medium",
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
        "inline-flex shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground dark:hover:bg-background",
        size === "sm" ? "h-7 w-7" : "h-8 w-8",
        active && "bg-muted text-foreground dark:bg-background",
      )}
    >
      {children}
    </button>
  );
}
