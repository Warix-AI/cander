"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  Link2,
  ImageIcon,
  Paperclip,
  Pin,
  Plus,
} from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { ReferenceChip } from "@/components/shell/ReferenceChip";
import { ComposerUsageBar } from "@/components/shell/ComposerUsageBar";
import {
  USAGE_BAR_THRESHOLD,
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
  type SpaceLibraryId,
} from "@/lib/space-library";
import { isChatSpace } from "@/lib/spaces";
import { labelFor } from "@/lib/build-loop";
import { useChatCanvasCentered } from "@/lib/chat-layout";
import {
  consumeComposerSeed,
  peekComposerSeed,
  subscribeComposerSeed,
} from "@/lib/composer-seed";
import { useShellStyle } from "@/lib/shell-chrome";
import { useMobileShell } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import type { ChatImageAttachment } from "@/lib/types";

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
  onSend: (
    text: string,
    opts?: { attachments?: ChatImageAttachment[] },
  ) => void;
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
    entityReference,
    clearPageReference,
    clearEntityReference,
    entitlements,
    voiceActive,
    toggleVoice,
    pinTier,
    setPin,
    clearPin,
  } = useApp();
  const floating = useShellStyle() === "floating";
  const mobile = useMobileShell();
  const { centered } = useChatCanvasCentered();
  const usagePercent = useHourlyUsagePercent();
  const [value, setValue] = useState("");
  const [dictating, setDictating] = useState(false);
  const [menu, setMenu] = useState<MenuId>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [images, setImages] = useState<ChatImageAttachment[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  /** Keep the + menu visible while the native file sheet is open (iOS). */
  const awaitingFilePickRef = useRef(false);

  useEffect(() => {
    const apply = () => {
      const seed = consumeComposerSeed();
      if (!seed) return;
      setValue(seed);
      window.requestAnimationFrame(() => {
        textRef.current?.focus();
        const el = textRef.current;
        if (el) {
          const end = el.value.length;
          el.setSelectionRange(end, end);
        }
      });
    };
    if (peekComposerSeed()) apply();
    return subscribeComposerSeed(apply);
  }, []);

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
      if (awaitingFilePickRef.current) return;
      if (!wrapRef.current?.contains(event.target as Node)) setMenu(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        awaitingFilePickRef.current = false;
        setMenu(null);
      }
    };
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  useEffect(() => {
    const resetAwaitingPick = () => {
      awaitingFilePickRef.current = false;
    };
    const inputs: HTMLInputElement[] = [];
    if (fileRef.current) inputs.push(fileRef.current);
    if (imageRef.current) inputs.push(imageRef.current);
    for (const input of inputs) {
      input.addEventListener("cancel", resetAwaitingPick);
    }
    return () => {
      for (const input of inputs) {
        input.removeEventListener("cancel", resetAwaitingPick);
      }
    };
  }, []);

  const openFilePicker = (ref: RefObject<HTMLInputElement | null>) => {
    awaitingFilePickRef.current = true;
    ref.current?.click();
  };

  const finishFilePick = (
    picked: FileList | null,
    merge: (names: string[]) => void,
  ) => {
    awaitingFilePickRef.current = false;
    const next = [...(picked ?? [])].map((file) => file.name);
    if (!next.length) return;
    merge(next);
    setMenu(null);
  };

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
  const hasPayload = hasText || images.length > 0 || files.length > 0;
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
    if (dictatingActive && !hasText && !images.length) {
      endDictation();
      return;
    }
    const refPrefix = pageReference
      ? `[ref: ${pageReference.title} — ${pageReference.url}] `
      : entityReference
        ? `[ref: ${entityReference.label ?? entityReference.type} — ${entityReference.snapshot ?? entityReference.id}] `
      : "";
    const fileNote = files.length
      ? files.map((name) => `[User attached file: ${name}]`).join("\n")
      : "";
    const payload = `${refPrefix}${value}`.trim();
    const body = [payload, fileNote].filter(Boolean).join("\n");
    if (!body && !images.length) return;
    onSend(body || "", images.length ? { attachments: images } : undefined);
    setValue("");
    setFiles([]);
    setImages([]);
    setMenu(null);
    setDictating(false);
    clearPageReference();
    clearEntityReference();
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

  const showUsageBar = !compact && usagePercent >= USAGE_BAR_THRESHOLD;

  return (
    <div className={cn(showUsageBar && "composer-dock-stack")}>
    <form
      className={
        compact
          ? "w-full"
          : landing
            ? "w-full"
            : floating && !mobile
              ? cn(
                  centered
                    ? "px-4 sm:px-6"
                    : "pr-2.5 pl-1.5 sm:pr-3 sm:pl-2",
                  showUsageBar
                    ? "pb-0"
                    : "composer-keyboard-pad pb-[max(0.75rem,calc(env(safe-area-inset-bottom)+0.35rem))] sm:pb-4",
                )
              : cn(
                  "px-4 sm:px-6",
                  showUsageBar
                    ? "pb-0"
                    : "composer-keyboard-pad pb-[max(0.75rem,calc(env(safe-area-inset-bottom)+0.35rem))] sm:pb-4",
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
                openFilePicker(fileRef);
              }}
            >
              <Paperclip className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.6} />
              Upload file
            </MenuBtn>
            <MenuBtn
              onClick={() => {
                openFilePicker(imageRef);
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
                    "min-w-0 flex-1 resize-none bg-transparent text-[16px] outline-none placeholder:text-muted-foreground sm:text-[14px]",
                    hasText ? "h-7 py-1 leading-5" : "h-7 py-0 leading-7",
                  )}
                />
                <ComposerTrailingActions
                  compact
                  hasText={hasPayload}
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
              "composer-shell px-2.5 py-2",
              showUsageBar && "mb-2.5",
            )}
          >
            {files.length || images.length ? (
              <div className="mb-1.5 flex flex-wrap items-end gap-1.5">
                {images.map((image) => (
                  <button
                    key={`${image.name}-${image.url.slice(-12)}`}
                    type="button"
                    title="Remove image"
                    onClick={() =>
                      setImages((current) =>
                        current.filter((item) => item.url !== image.url),
                      )
                    }
                    className="relative overflow-hidden rounded-[10px] border border-border"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image.url}
                      alt={image.name}
                      className="h-10 w-10 object-cover"
                    />
                  </button>
                ))}
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
            {pageReference || entityReference ? (
              <div className="mb-1.5 flex items-center gap-1.5">
                {entityReference ? (
                  <ReferenceChip
                    ref={entityReference}
                    onRemove={clearEntityReference}
                    className="min-w-0 flex-1"
                  />
                ) : pageReference ? (
                  <span className="inline-flex min-w-0 flex-1 items-center gap-1.5 rounded-lg bg-background px-2.5 py-1.5 text-[11.5px]">
                    <Link2 className="h-3 w-3 shrink-0 text-muted-foreground" strokeWidth={1.6} />
                    <span className="truncate font-medium">{pageReference.title}</span>
                    <span className="truncate font-mono text-muted-foreground">
                      {pageReference.url}
                    </span>
                  </span>
                ) : null}
                <button
                  type="button"
                  aria-label="Remove reference"
                  onClick={() => {
                    clearPageReference();
                    clearEntityReference();
                  }}
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
                    {spaceLibraryLabel(spaceId as SpaceLibraryId)}
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
                enterKeyHint="send"
                autoComplete="off"
                onFocus={(event) => {
                  onFocus?.();
                  window.setTimeout(() => {
                    event.target.scrollIntoView({
                      block: "nearest",
                      inline: "nearest",
                    });
                    window.scrollTo(0, 0);
                  }, 50);
                }}
                onChange={(event) => {
                  const next = event.target.value;
                  setValue(next);
                  if (landing || stayInPlace) return;
                  // Stay on the project dock — do not swap to the space chat.
                  if (projectId) return;
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
                  "max-h-[212px] min-h-8 min-w-0 flex-1 resize-none overflow-y-hidden bg-transparent text-[16px] outline-none placeholder:text-muted-foreground sm:text-[14px]",
                  hasText ? "h-auto py-1.5 leading-5" : "h-8 py-0 leading-8",
                )}
              />
              <div className="flex shrink-0 items-center gap-0.5 self-end md:self-start">
              <ComposerTrailingActions
                hasText={hasPayload}
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

        {showUsageBar ? (
          <ComposerUsageBar floating={floating} percent={usagePercent} />
        ) : null}
      </div>
    </form>
    {/* Outside <form> so iOS doesn’t show the prev/next accessory bar above the keyboard. */}
    <input
      ref={fileRef}
      type="file"
      multiple
      tabIndex={-1}
      className="sr-only"
      aria-hidden
      onChange={(event) => {
        finishFilePick(event.target.files, (next) => {
          setFiles((current) => [...current, ...next].slice(0, 6));
        });
        event.target.value = "";
      }}
    />
    <input
      ref={imageRef}
      type="file"
      accept="image/*"
      multiple
      tabIndex={-1}
      className="sr-only"
      aria-hidden
      onChange={(event) => {
        const list = event.target.files;
        awaitingFilePickRef.current = false;
        if (!list?.length) {
          event.target.value = "";
          return;
        }
        const readers = [...list].slice(0, 4).map(
          (file) =>
            new Promise<ChatImageAttachment | null>((resolve) => {
              if (!file.type.startsWith("image/")) {
                resolve(null);
                return;
              }
              if (file.size > 2_500_000) {
                resolve(null);
                return;
              }
              const reader = new FileReader();
              reader.onload = () => {
                const url = typeof reader.result === "string" ? reader.result : "";
                if (!url) {
                  resolve(null);
                  return;
                }
                resolve({
                  url,
                  name: file.name,
                  mime: file.type || "image/png",
                });
              };
              reader.onerror = () => resolve(null);
              reader.readAsDataURL(file);
            }),
        );
        void Promise.all(readers).then((items) => {
          const next = items.filter(Boolean) as ChatImageAttachment[];
          if (next.length) {
            setImages((current) => [...current, ...next].slice(0, 4));
          }
          setMenu(null);
        });
        event.target.value = "";
      }}
    />
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
