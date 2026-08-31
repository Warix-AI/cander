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
  consumeComposerPendingInput,
  consumeComposerSeed,
  peekComposerPendingInput,
  peekComposerSeed,
  subscribeComposerSeed,
} from "@/lib/composer-seed";
import {
  DOCUMENT_ACCEPT,
  filesFromList,
  isCapacitorNative,
  toSendAttachments,
} from "@/lib/composer-attach";
import { composerAttachActions } from "@/lib/ai/raw-openai/limits";
import { isRawOpenAIModeEnabled } from "@/lib/ai/raw-openai/flags";
import {
  applyComposerTextareaSize,
  nextComposerTextareaSize,
  readTextareaVerticalMetrics,
  resolveComposerAutosizeMetrics,
} from "@/lib/composer-autosize";
import { getNativeCapabilities } from "@/lib/native";
import {
  isSpeechToTextSupported,
  startSpeechToText,
  type SpeechSession,
} from "@/lib/voice/speech-to-text";
import {
  isOpenAIDictationSupported,
  startVoiceDictation,
  type VoiceDictationSession,
} from "@/lib/voice/openai-dictation";
import type { AudioMeter } from "@/lib/voice/audio-meter";
import { logDictationTiming } from "@/lib/voice/audio-meter";
import { useShellStyle } from "@/lib/shell-chrome";
import { useMobileShell } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import type {
  ChatFileAttachment,
  ChatImageAttachment,
  ChatSendAttachment,
} from "@/lib/types";

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
      sendAttachments?: ChatSendAttachment[];
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
    pinTier,
    setPin,
    clearPin,
    overlay,
  } = useApp();
  const floating = useShellStyle() === "floating";
  const mobile = useMobileShell();
  const { centered } = useChatCanvasCentered();
  const usagePercent = useHourlyUsagePercent();
  const [value, setValue] = useState("");
  const [dictating, setDictating] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [dictationMeter, setDictationMeter] = useState<AudioMeter | null>(null);
  const [transcriptReveal, setTranscriptReveal] = useState(false);
  const [menu, setMenu] = useState<MenuId>(null);
  const [files, setFiles] = useState<ChatFileAttachment[]>([]);
  const [images, setImages] = useState<ChatImageAttachment[]>([]);
  const [dictateError, setDictateError] = useState(null as string | null);
  const [attachError, setAttachError] = useState(null as string | null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const photoLibRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const speechRef = useRef<SpeechSession | null>(null);
  const dictationRef = useRef<VoiceDictationSession | null>(null);
  /** After stop: insert into composer; after send-while-recording: send immediately. */
  const afterTranscriptionRef = useRef<"insert" | "send">("insert");
  const valueBaseRef = useRef("");
  /** Keep the + menu visible while the native file sheet is open (iOS). */
  const awaitingFilePickRef = useRef(false);
  const nativeShell = isCapacitorNative();
  const mobileWeb = mobile && !nativeShell;
  const attachActions = composerAttachActions({
    nativeCapacitor: nativeShell,
    mobileShell: mobileWeb,
  });
  /** Prevent re-opening keyboard after send until the user taps the composer. */
  const suppressAutoFocusRef = useRef(false);

  useEffect(() => {
    const apply = () => {
      const pending = peekComposerPendingInput()
        ? consumeComposerPendingInput()
        : null;
      if (pending) {
        if (pending.text) setValue(pending.text);
        if (pending.attachments?.length) {
          const imgs = pending.attachments.filter((a) => a.type === "image");
          const filesOnly = pending.attachments.filter((a) => a.type === "file");
          if (imgs.length) {
            setImages((current) =>
              [
                ...current,
                ...imgs.map((a) => ({
                  name: a.filename,
                  url: a.dataUrl || "",
                  mime: a.mimeType,
                })),
              ].slice(0, 4),
            );
          }
          if (filesOnly.length) {
            setFiles((current) =>
              [
                ...current,
                ...filesOnly.map((a) => ({
                  name: a.filename,
                  text: a.text,
                })),
              ].slice(0, 4),
            );
          }
        }
        window.requestAnimationFrame(() => {
          textRef.current?.focus();
          const el = textRef.current;
          if (el) {
            const end = el.value.length;
            el.setSelectionRange(end, end);
          }
        });
        return;
      }
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
    if (peekComposerPendingInput() || peekComposerSeed()) apply();
    return subscribeComposerSeed(apply);
  }, []);

  // New / empty chat on Capacitor: open keyboard once. Never force after send
  // or when a modal needs focus elsewhere.
  useEffect(() => {
    suppressAutoFocusRef.current = false;
  }, [thread?.id]);

  useEffect(() => {
    if (!autoFocus || !nativeShell) return;
    if (suppressAutoFocusRef.current) return;
    if (overlay) return;
    if (view === "browser") return;
    const id = window.requestAnimationFrame(() => {
      if (suppressAutoFocusRef.current) return;
      textRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [autoFocus, nativeShell, overlay, view, thread?.id]);

  useEffect(() => {
    const el = textRef.current;
    if (!el || compact) return;

    const resize = () => {
      const vertical = readTextareaVerticalMetrics(el);
      const metrics = resolveComposerAutosizeMetrics({
        mobile,
        lineHeight: vertical.lineHeight,
        paddingY: vertical.paddingY,
      });
      // Empty: always one line. Avoids the space-slide animation measuring
      // the placeholder at ~0 width and locking the box at max height.
      if (!value) {
        applyComposerTextareaSize(
          el,
          nextComposerTextareaSize(0, metrics, { empty: true }),
        );
        return;
      }
      el.style.height = "auto";
      const scroll = el.scrollHeight;
      applyComposerTextareaSize(el, nextComposerTextareaSize(scroll, metrics));
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [value, compact, mobile]);

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
  const dictatingActive = dictating || transcribing;
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

  const cancelDictation = () => {
    dictationRef.current?.cancel();
    dictationRef.current = null;
    speechRef.current?.stop();
    speechRef.current = null;
    afterTranscriptionRef.current = "insert";
    setDictationMeter(null);
    setDictating(false);
    setTranscribing(false);
    setDictateError(null);
    // Restore draft text that existed before dictation began
    if (valueBaseRef.current) {
      setValue(valueBaseRef.current.trimEnd());
    }
  };

  const finishTranscription = (text: string) => {
    const intent = afterTranscriptionRef.current;
    afterTranscriptionRef.current = "insert";
    const next = `${valueBaseRef.current}${text} `.replace(/\s+/g, " ").trim();
    valueBaseRef.current = next ? `${next} ` : "";

    if (intent === "send") {
      // Transcribe → send immediately (no second tap)
      const refPrefix = pageReference
        ? `[ref: ${pageReference.title} — ${pageReference.url}] `
        : entityReference
          ? `[ref: ${entityReference.label ?? entityReference.type} — ${entityReference.snapshot ?? entityReference.id}] `
          : "";
      const body = `${refPrefix}${next}`.trim();
      const usableImages = images.filter((img) =>
        img.url?.startsWith("data:image/"),
      );
      const sendAttachments = toSendAttachments(usableImages, files);
      if (!body && !usableImages.length && !files.length) {
        setValue(next);
        setDictateError("No speech detected.");
        return;
      }
      suppressAutoFocusRef.current = true;
      try {
        getNativeCapabilities().keyboard.dismiss();
        getNativeCapabilities().haptics.impact("send");
      } catch {
        /* never block send */
      }
      onSend(body || "", {
        ...(usableImages.length ? { attachments: usableImages } : {}),
        ...(files.length ? { files } : {}),
        ...(sendAttachments.length ? { sendAttachments } : {}),
      });
      setValue("");
      setFiles([]);
      setImages([]);
      setMenu(null);
      setDictateError(null);
      setAttachError(null);
      clearPageReference();
      clearEntityReference();
      return;
    }

    setTranscriptReveal(true);
    setValue(next ? `${next} ` : "");
    window.setTimeout(() => {
      setTranscriptReveal(false);
      const el = textRef.current;
      if (el) {
        el.focus();
        const end = el.value.length;
        el.setSelectionRange(end, end);
      }
    }, 180);
  };

  const stopDictationAndTranscribe = (intent: "insert" | "send" = "insert") => {
    const session = dictationRef.current;
    if (!session) {
      cancelDictation();
      return;
    }
    afterTranscriptionRef.current = intent;
    setDictating(false);
    setTranscribing(true);
    setDictationMeter(null);
    void session
      .stopAndTranscribe()
      .then((text) => {
        finishTranscription(text);
      })
      .catch((e) => {
        afterTranscriptionRef.current = "insert";
        setDictateError(
          e instanceof Error ? e.message : "Transcription failed.",
        );
      })
      .finally(() => {
        dictationRef.current = null;
        setTranscribing(false);
        setDictating(false);
        setDictationMeter(null);
      });
  };

  const submit = () => {
    if (transcribing) return;
    if (dictating) {
      // Send while recording → stop + transcribe + send
      stopDictationAndTranscribe("send");
      return;
    }
    const refPrefix = pageReference
      ? `[ref: ${pageReference.title} — ${pageReference.url}] `
      : entityReference
        ? `[ref: ${entityReference.label ?? entityReference.type} — ${entityReference.snapshot ?? entityReference.id}] `
      : "";
    // Visible chat text = what the user typed only. File bodies go via opts.files.
    const body = `${refPrefix}${value}`.trim();
    if (!body && !images.length && !files.length) return;
    speechRef.current?.stop();
    speechRef.current = null;
    dictationRef.current?.cancel();
    dictationRef.current = null;
    const usableImages = images.filter((img) =>
      img.url?.startsWith("data:image/"),
    );
    const sendAttachments = toSendAttachments(usableImages, files);
    if (
      !body &&
      !usableImages.length &&
      !files.length
    ) {
      setAttachError(
        "That attachment couldn’t be prepared for send. Try a JPEG/PNG or another file.",
      );
      return;
    }
    // Give the reply the screen: dismiss keyboard immediately on Capacitor.
    suppressAutoFocusRef.current = true;
    try {
      getNativeCapabilities().keyboard.dismiss();
      getNativeCapabilities().haptics.impact("send");
    } catch {
      /* never block send */
    }
    onSend(body || "", {
      ...(usableImages.length ? { attachments: usableImages } : {}),
      ...(files.length ? { files } : {}),
      ...(sendAttachments.length ? { sendAttachments } : {}),
    });
    setValue("");
    setFiles([]);
    setImages([]);
    setMenu(null);
    setDictating(false);
    setTranscribing(false);
    setDictateError(null);
    setAttachError(null);
    clearPageReference();
    clearEntityReference();
  };

  const startDictation = () => {
    if (!entitlements.hasVoice) return;
    setDictateError(null);
    setTranscribing(false);
    afterTranscriptionRef.current = "insert";

    const useOpenAI = isRawOpenAIModeEnabled();
    if (useOpenAI) {
      if (!isOpenAIDictationSupported()) {
        setDictateError("Microphone recording isn’t available here.");
        return;
      }
      const t0 = performance.now();
      logDictationTiming("mic_button_clicked", t0);
      valueBaseRef.current = value.trim() ? `${value.trim()} ` : "";
      // Show recording UI immediately — do not wait for getUserMedia
      setDictating(true);
      setDictationMeter(null);
      logDictationTiming("recording_ui_visible", t0);
      dictationRef.current?.cancel();
      void startVoiceDictation({
        t0,
        onError: (message) => {
          setDictateError(message);
          setDictating(false);
          setDictationMeter(null);
          dictationRef.current = null;
        },
      })
        .then((session) => {
          dictationRef.current = session;
          setDictationMeter(session.getMeter());
        })
        .catch((e) => {
          setDictateError(
            e instanceof Error ? e.message : "Couldn’t start recording.",
          );
          setDictating(false);
          setDictationMeter(null);
        });
      return;
    }

    if (!isSpeechToTextSupported()) {
      setDictateError("Speech recognition isn’t available here.");
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

  // Cleanup dictation session on unmount
  useEffect(() => {
    return () => {
      dictationRef.current?.cancel();
      dictationRef.current = null;
    };
  }, []);
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
        onDragOver={(event) => {
          if (event.dataTransfer?.types?.includes("Files")) {
            event.preventDefault();
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          const dt = event.dataTransfer;
          if (!dt) return;
          void (async () => {
            const attached =
              await getNativeCapabilities().files.fromDataTransfer(dt);
            if (!attached.length) return;
            getNativeCapabilities().haptics.impact("select");
            const nextImages = attached.filter((a) => a.type === "image");
            const nextFiles = attached.filter((a) => a.type === "file");
            if (nextImages.length) {
              setImages((current) =>
                [
                  ...current,
                  ...nextImages.map((a) => ({
                    name: a.filename,
                    url: a.dataUrl!,
                    mime: a.mimeType,
                  })),
                ].slice(0, 4),
              );
            }
            if (nextFiles.length) {
              setFiles((current) =>
                [
                  ...current,
                  ...nextFiles.map((a) => ({
                    name: a.filename,
                    text: a.text,
                  })),
                ].slice(0, 4),
              );
            }
          })();
        }}
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
                {attachActions.includes("take_photo") ? (
                  <MenuRow
                    icon={<Camera className="h-4 w-4" strokeWidth={1.7} />}
                    label="Take Photo"
                    onClick={() => {
                      setAttachError(null);
                      setMenu(null);
                      void (async () => {
                        const result =
                          await getNativeCapabilities().media.pickCameraPhoto();
                        if (result.ok) {
                          getNativeCapabilities().haptics.impact("select");
                          setImages((current) =>
                            [...current, result.image].slice(0, 4),
                          );
                          return;
                        }
                        if (!result.cancelled) setAttachError(result.message);
                      })();
                    }}
                  />
                ) : null}
                {attachActions.includes("choose_photo") ? (
                  <MenuRow
                    icon={<ImageIcon className="h-4 w-4" strokeWidth={1.7} />}
                    label="Choose Photo"
                    onClick={() => {
                      setAttachError(null);
                      setMenu(null);
                      void (async () => {
                        const result =
                          await getNativeCapabilities().media.pickLibraryImages();
                        if (result.ok) {
                          getNativeCapabilities().haptics.impact("select");
                          setImages((current) =>
                            [...current, result.image].slice(0, 4),
                          );
                          return;
                        }
                        if (!result.cancelled) setAttachError(result.message);
                      })();
                    }}
                  />
                ) : null}
                <MenuRow
                  icon={<Paperclip className="h-4 w-4" strokeWidth={1.7} />}
                  label="Upload File"
                  onClick={() => {
                    setAttachError(null);
                    openFilePicker(fileRef);
                    setMenu(null);
                  }}
                />
              </>
            ) : mobileWeb ? (
              <>
                <MenuRow
                  icon={<Camera className="h-4 w-4" strokeWidth={1.7} />}
                  label="Take Photo"
                  onClick={() => {
                    setAttachError(null);
                    openFilePicker(cameraRef);
                    setMenu(null);
                  }}
                />
                <MenuRow
                  icon={<ImageIcon className="h-4 w-4" strokeWidth={1.7} />}
                  label="Choose Photo"
                  onClick={() => {
                    setAttachError(null);
                    openFilePicker(photoLibRef);
                    setMenu(null);
                  }}
                />
                <MenuRow
                  icon={<FileText className="h-4 w-4" strokeWidth={1.7} />}
                  label="Upload File"
                  onClick={() => {
                    setAttachError(null);
                    openFilePicker(fileRef);
                    setMenu(null);
                  }}
                />
              </>
            ) : (
              <>
                <MenuRow
                  icon={<ImageIcon className="h-4 w-4" strokeWidth={1.7} />}
                  label="Upload Image"
                  onClick={() => {
                    setAttachError(null);
                    openFilePicker(imageRef);
                    setMenu(null);
                  }}
                />
                <MenuRow
                  icon={<FileText className="h-4 w-4" strokeWidth={1.7} />}
                  label="Upload File"
                  onClick={() => {
                    setAttachError(null);
                    openFilePicker(fileRef);
                    setMenu(null);
                  }}
                />
              </>
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

        {compact ? (
          <div className="composer-shell py-1.5 pr-1.5 pl-3">
            {dictatingActive ? (
              <ComposerRecordingView
                compact
                status={transcribing ? "transcribing" : "recording"}
                meter={dictationMeter}
                onCancel={cancelDictation}
                onStop={() => stopDictationAndTranscribe("insert")}
                onSend={() => stopDictationAndTranscribe("send")}
              />
            ) : (
              <div className="flex h-9 items-center gap-0.5">
                <textarea
                  value={value}
                  rows={1}
                  placeholder={hint}
                  autoFocus={autoFocus}
                  onFocus={() => {
                    suppressAutoFocusRef.current = false;
                    onFocus?.();
                  }}
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
                  canSend={hasPayload}
                  hasVoice={entitlements.hasVoice}
                  onStartDictation={startDictation}
                  onSend={submit}
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
                    className="relative flex h-10 w-10 flex-col items-center justify-center overflow-hidden rounded-[10px] border border-border bg-muted"
                  >
                    <FileText
                      className="h-4 w-4 text-muted-foreground"
                      strokeWidth={1.7}
                    />
                    <span className="mt-0.5 max-w-[2.5rem] truncate font-mono text-[8px] leading-none text-muted-foreground">
                      {(file.name.split(".").pop() || "FILE")
                        .slice(0, 4)
                        .toUpperCase()}
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
              <ComposerRecordingView
                status={transcribing ? "transcribing" : "recording"}
                meter={dictationMeter}
                onCancel={cancelDictation}
                onStop={() => stopDictationAndTranscribe("insert")}
                onSend={() => stopDictationAndTranscribe("send")}
              />
            ) : (
            <div
              className={cn(
                "flex min-h-8 gap-1",
                mobile ? "items-end" : !hasText ? "items-center" : "items-start",
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
                  suppressAutoFocusRef.current = false;
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
                  "min-h-8 min-w-0 flex-1 resize-none overflow-y-hidden bg-transparent text-[16px] outline-none placeholder:text-muted-foreground sm:text-[14px]",
                  mobile ? "max-h-[none]" : "max-h-[212px]",
                  hasText ? "h-auto py-1.5 leading-5" : "h-8 py-0 leading-8",
                  transcriptReveal && "opacity-100 transition-opacity duration-200",
                )}
              />
              <div
                className={cn(
                  "flex shrink-0 items-center gap-0.5",
                  mobile ? "self-end" : "self-end md:self-start",
                )}
              >
                <ComposerTrailingActions
                  canSend={hasPayload}
                  hasVoice={entitlements.hasVoice}
                  onStartDictation={startDictation}
                  onSend={submit}
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
      accept={DOCUMENT_ACCEPT}
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
    <input
      ref={imageRef}
      type="file"
      multiple
      accept="image/png,image/jpeg,image/jpg,image/webp,image/*"
      tabIndex={-1}
      className="sr-only"
      aria-hidden
      onChange={(event) => {
        const list = event.target.files;
        awaitingFilePickRef.current = false;
        setAttachError(null);
        void filesFromList(list).then((parsed) => {
          if (parsed.images.length) {
            setImages((current) =>
              [...current, ...parsed.images].slice(0, 4),
            );
            setMenu(null);
          } else if (list?.length) {
            setAttachError("That didn’t look like a supported image.");
          }
        });
        event.target.value = "";
      }}
    />
    <input
      ref={cameraRef}
      type="file"
      accept="image/*"
      capture="environment"
      tabIndex={-1}
      className="sr-only"
      aria-hidden
      onChange={(event) => {
        const list = event.target.files;
        awaitingFilePickRef.current = false;
        setAttachError(null);
        void filesFromList(list).then((parsed) => {
          if (parsed.images.length) {
            setImages((current) =>
              [...current, ...parsed.images].slice(0, 4),
            );
            setMenu(null);
          }
        });
        event.target.value = "";
      }}
    />
    <input
      ref={photoLibRef}
      type="file"
      multiple
      accept="image/*"
      tabIndex={-1}
      className="sr-only"
      aria-hidden
      onChange={(event) => {
        const list = event.target.files;
        awaitingFilePickRef.current = false;
        setAttachError(null);
        void filesFromList(list).then((parsed) => {
          if (parsed.images.length) {
            setImages((current) =>
              [...current, ...parsed.images].slice(0, 4),
            );
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
      className="absolute inset-x-0 bottom-[calc(100%+8px)] z-40 max-h-[min(24rem,50vh)] overflow-y-auto light-surface shell-g3-radius bg-popover p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.08)] dark:bg-muted"
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
      className="menu-row-hover flex w-full items-center gap-3 rounded-[14px] px-2 py-2 text-left transition-colors duration-200 hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
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
