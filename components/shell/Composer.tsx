"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  Camera,
  FileText,
  ImageIcon,
  Link2,
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
import {
  DOCUMENT_ACCEPT,
  filesFromList,
  isCapacitorNative,
  pickWithCapacitorCamera,
} from "@/lib/composer-attach";
import {
  isSpeechToTextSupported,
  startSpeechToText,
  type SpeechSession,
} from "@/lib/voice/speech-to-text";
import { stopTextToSpeech } from "@/lib/voice/text-to-speech";
import { useShellStyle } from "@/lib/shell-chrome";
import { useMobileShell } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import type { ChatFileAttachment, ChatImageAttachment } from "@/lib/types";

type MenuId = "plus" | null;

export function Composer({
  onSend,
  landing = false,
  compact = false,
  hideSpaceTools = false,
  /** Parent owns horizontal padding + keyboard lift (card + composer). */
  inDock = false,
  placeholder,
  onFocus,
  autoFocus = false,
}: {
  onSend: (
    text: string,
    opts?: {
      attachments?: ChatImageAttachment[];
      files?: ChatFileAttachment[];
    },
  ) => void;
  landing?: boolean;
  compact?: boolean;
  hideSpaceTools?: boolean;
  inDock?: boolean;
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
  const [files, setFiles] = useState<ChatFileAttachment[]>([]);
  const [images, setImages] = useState<ChatImageAttachment[]>([]);
  const [dictateError, setDictateError] = useState<string | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const speechRef = useRef<SpeechSession | null>(null);
  const valueBaseRef = useRef("");
  /** Keep the + menu visible while the native file sheet is open (iOS). */
  const awaitingFilePickRef = useRef(false);
  const nativeShell = isCapacitorNative();

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
    const input = fileRef.current;
    input?.addEventListener("cancel", resetAwaitingPick);
    return () => {
      input?.removeEventListener("cancel", resetAwaitingPick);
    };
  }, []);

  useEffect(() => {
    return () => {
      speechRef.current?.stop();
      speechRef.current = null;
    };
  }, []);

  const openFilePicker = (ref: RefObject<HTMLInputElement | null>) => {
    awaitingFilePickRef.current = true;
    ref.current?.click();
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
    speechRef.current?.stop();
    speechRef.current = null;
    setDictating(false);
    setDictateError(null);
  };

  const stopVoice = () => {
    speechRef.current?.stop();
    speechRef.current = null;
    stopTextToSpeech();
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
    // Visible chat text = what the user typed only. File bodies go via opts.files.
    const body = `${refPrefix}${value}`.trim();
    // #region agent log
    fetch('http://127.0.0.1:7521/ingest/0b7940f7-640a-4835-98e0-f86faa434abe',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'20f195'},body:JSON.stringify({sessionId:'20f195',runId:'post-fix',hypothesisId:'E',location:'Composer.tsx:submit',message:'submit body composition',data:{filesCount:files.length,fileNames:files.map(f=>f.name).slice(0,3),hasFileText:files.some(f=>Boolean(f.text)),imagesCount:images.length,bodyPrefix:body.slice(0,80),bodyHasAttachMarker:/User attached file|Attached file/i.test(body),valueLen:value.length},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (!body && !images.length && !files.length) return;
    speechRef.current?.stop();
    speechRef.current = null;
    onSend(body || "", {
      ...(images.length ? { attachments: images } : {}),
      ...(files.length ? { files } : {}),
    });
    setValue("");
    setFiles([]);
    setImages([]);
    setMenu(null);
    setDictating(false);
    setDictateError(null);
    clearPageReference();
    clearEntityReference();
  };

  const startVoice = () => {
    if (!entitlements.hasVoice) return;
    stopTextToSpeech();
    if (!voiceActive) toggleVoice();
  };

  const startDictation = () => {
    if (!entitlements.hasVoice) return;
    if (voiceActive) toggleVoice();
    setDictateError(null);
    if (!isSpeechToTextSupported()) {
      setDictateError("Speech recognition isn’t available here.");
      setDictating(true);
      return;
    }
    valueBaseRef.current = value.trim() ? `${value.trim()} ` : "";
    setDictating(true);
    speechRef.current?.stop();
    speechRef.current = startSpeechToText(
      {
        onPartial: (text) => {
          setValue(`${valueBaseRef.current}${text}`);
        },
        onFinal: (text) => {
          valueBaseRef.current = `${valueBaseRef.current}${text} `.replace(
            /\s+/g,
            " ",
          );
          setValue(valueBaseRef.current);
        },
        onError: (message) => {
          setDictateError(message);
        },
        onEnd: () => {
          setDictating(false);
          speechRef.current = null;
        },
      },
      { continuous: true },
    );
  };

  // Voice conversation mode: listen → send → (TTS handled in AppProvider).
  useEffect(() => {
    if (!voiceActive || dictating || !entitlements.hasVoice) return;
    if (!isSpeechToTextSupported()) return;

    let cancelled = false;
    const listen = () => {
      if (cancelled) return;
      speechRef.current?.stop();
      speechRef.current = startSpeechToText(
        {
          onFinal: (text) => {
            if (cancelled || !text.trim()) return;
            speechRef.current?.stop();
            speechRef.current = null;
            onSend(text.trim());
          },
          onError: () => {
            /* stay in voice mode; user can retry */
          },
          onEnd: () => {
            if (!cancelled && voiceActive) {
              window.setTimeout(listen, 350);
            }
          },
        },
        { continuous: false },
      );
    };
    listen();
    return () => {
      cancelled = true;
      speechRef.current?.stop();
      speechRef.current = null;
    };
  }, [voiceActive, dictating, entitlements.hasVoice, onSend]);

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
        compact || inDock
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
          landing || compact || inDock ? "max-w-none" : "max-w-[38rem]",
          !landing && !compact && !inDock && (!floating || centered) && "mx-auto",
          !stayInPlace && "composer-dock",
        )}
      >
        {menu === "plus" && !compact ? (
          <ComposerMenu>
            {pinTarget ? (
              <MenuRow
                icon={<Pin className={cn("h-4 w-4", pinned && "fill-current")} strokeWidth={1.7} />}
                label={pinned ? "Unpin" : "Pin"}
                onClick={() => {
                  if (pinned) clearPin(pinTarget.kind, pinTarget.id);
                  else setPin(pinTarget.kind, pinTarget.id, "primary");
                  setMenu(null);
                }}
              />
            ) : null}
            {nativeShell ? (
              <>
                <MenuRow
                  icon={<Camera className="h-4 w-4" strokeWidth={1.7} />}
                  label="Camera"
                  onClick={() => {
                    setAttachError(null);
                    setMenu(null);
                    void (async () => {
                      const result = await pickWithCapacitorCamera("camera");
                      // #region agent log
                      fetch('http://127.0.0.1:7521/ingest/0b7940f7-640a-4835-98e0-f86faa434abe',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'20f195'},body:JSON.stringify({sessionId:'20f195',runId:'pre-fix',hypothesisId:'B',location:'Composer.tsx:Camera',message:'camera pick result',data:{ok:result.ok,cancelled:'cancelled' in result?result.cancelled:false,message:result.ok?'':result.message},timestamp:Date.now()})}).catch(()=>{});
                      // #endregion
                      if (result.ok) {
                        setImages((current) =>
                          [...current, result.image].slice(0, 4),
                        );
                        return;
                      }
                      if (!result.cancelled) setAttachError(result.message);
                    })();
                  }}
                />
                <MenuRow
                  icon={<ImageIcon className="h-4 w-4" strokeWidth={1.7} />}
                  label="Photos"
                  onClick={() => {
                    setAttachError(null);
                    setMenu(null);
                    void (async () => {
                      const result = await pickWithCapacitorCamera("photos");
                      // #region agent log
                      fetch('http://127.0.0.1:7521/ingest/0b7940f7-640a-4835-98e0-f86faa434abe',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'20f195'},body:JSON.stringify({sessionId:'20f195',runId:'pre-fix',hypothesisId:'A',location:'Composer.tsx:Photos',message:'photos pick result',data:{ok:result.ok,cancelled:'cancelled' in result?result.cancelled:false,message:result.ok?'':result.message},timestamp:Date.now()})}).catch(()=>{});
                      // #endregion
                      if (result.ok) {
                        setImages((current) =>
                          [...current, result.image].slice(0, 4),
                        );
                        return;
                      }
                      if (!result.cancelled) setAttachError(result.message);
                    })();
                  }}
                />
                <MenuRow
                  icon={<Paperclip className="h-4 w-4" strokeWidth={1.7} />}
                  label="Files"
                  onClick={() => openFilePicker(fileRef)}
                />
              </>
            ) : (
              <MenuRow
                icon={<Paperclip className="h-4 w-4" strokeWidth={1.7} />}
                label="Attach"
                onClick={() => openFilePicker(fileRef)}
              />
            )}
            {browserMode ? (
              <MenuRow
                icon={<Paperclip className="h-4 w-4" strokeWidth={1.7} />}
                label="Attach page"
                onClick={() => {
                  attachBrowserReference();
                  setMenu(null);
                }}
              />
            ) : null}
          </ComposerMenu>
        ) : null}

        {dictateError || attachError ? (
          <p className="mb-1 px-1 text-[12px] text-muted-foreground">
            {dictateError || attachError}
          </p>
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
                {files.map((file) => (
                  <button
                    key={file.name}
                    type="button"
                    title={`Remove ${file.name}`}
                    onClick={() =>
                      setFiles((current) =>
                        current.filter((item) => item.name !== file.name),
                      )
                    }
                    className="inline-flex h-10 max-w-[7.5rem] items-center gap-1.5 rounded-[10px] border border-border bg-muted px-2"
                  >
                    <FileText
                      className="h-4 w-4 shrink-0 text-muted-foreground"
                      strokeWidth={1.7}
                    />
                    <span className="truncate text-[11px] tracking-[-0.01em]">
                      {file.name}
                    </span>
                  </button>
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
      accept={
        nativeShell
          ? DOCUMENT_ACCEPT
          : `${DOCUMENT_ACCEPT},image/*`
      }
      tabIndex={-1}
      className="sr-only"
      aria-hidden
      onChange={(event) => {
        const list = event.target.files;
        awaitingFilePickRef.current = false;
        setAttachError(null);
        void filesFromList(list).then((parsed) => {
          if (parsed.files.length) {
            setFiles((current) => [...current, ...parsed.files].slice(0, 6));
          }
          if (parsed.images.length) {
            setImages((current) =>
              [...current, ...parsed.images].slice(0, 4),
            );
          }
          if (parsed.files.length || parsed.images.length) {
            setMenu(null);
          }
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

function MenuRow({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="menu-row-hover flex w-full items-center gap-3 rounded-[14px] px-2 py-2 text-left transition-colors duration-200"
    >
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
        {icon}
      </span>
      <span className="text-[15px] tracking-[-0.01em]">{label}</span>
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
