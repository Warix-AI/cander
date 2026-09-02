"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";
import {
  FileText,
  Hammer,
  Link2,
  MessageSquare,
  Paperclip,
  Pin,
  Plus,
  Search,
} from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { ReferenceChip } from "@/components/shell/ReferenceChip";
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
  ANY_ATTACH_ACCEPT,
  DOCUMENT_ACCEPT,
  filesFromList,
  isCapacitorNative,
  toSendAttachments,
} from "@/lib/composer-attach";
import { composerAttachActions } from "@/lib/ai/raw-openai/limits";
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
import { isUiConnectedStatus } from "@/lib/connectors/authz";
import {
  getConnectorConnectionsSnapshot,
  getConnectorConnectionsServerSnapshot,
  subscribeConnectorConnections,
} from "@/lib/connector-connections-store";
import {
  backspaceRemoveConnector,
  blocksFromText,
  connectorsFromBlocks,
  emptyComposerBlocks,
  normalizeComposerBlocks,
  removeConnectorBlock,
  textFromBlocks,
  toggleConnectorInBlocks,
  updateTextBlock,
  type ComposerBlock,
  type ComposerConnectorScope,
} from "@/lib/composer-blocks";

export type { ComposerConnectorScope };

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
      selectedConnectionId?: string | null;
      selectedConnectionIds?: string[] | null;
      scopedConnectorId?: string | null;
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
    workspaceId,
    spaceId,
    connectorId,
    view,
    projectId,
    threadId,
    setDraftAsDefaultChat,
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
    turnActive,
    stopTurn,
    panelMode,
  } = useApp();
  const floating = useShellStyle() === "floating";
  const mobile = useMobileShell();
  const { centered } = useChatCanvasCentered();
  const [blocks, setBlocks] = useState<ComposerBlock[]>(() =>
    emptyComposerBlocks(),
  );
  const value = textFromBlocks(blocks);
  const connectorScopes = connectorsFromBlocks(blocks);
  const [dictating, setDictating] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [dictationMeter, setDictationMeter] = useState<AudioMeter | null>(null);
  const [transcriptReveal, setTranscriptReveal] = useState(false);
  const [menu, setMenu] = useState<MenuId>(null);
  const focusedTextKeyRef = useRef<string | null>(null);
  const textCursorRef = useRef(0);
  const textInputRefs = useRef<
    Map<string, HTMLInputElement | HTMLTextAreaElement>
  >(new Map());
  const setValue = (next: string) => {
    setBlocks((current) => {
      if (!next) return emptyComposerBlocks();
      const scopes = connectorsFromBlocks(current);
      if (!scopes.length) return blocksFromText(next);
      return normalizeComposerBlocks([
        ...scopes.map((scope) => ({
          key: `c_${scope.connectionId}`,
          type: "connector" as const,
          scope,
        })),
        {
          key: `t_${Math.random().toString(36).slice(2, 9)}`,
          type: "text" as const,
          value: next,
        },
      ]);
    });
  };
  const connectionsByWorkspace = useSyncExternalStore(
    subscribeConnectorConnections,
    getConnectorConnectionsSnapshot,
    getConnectorConnectionsServerSnapshot,
  );
  const activeConnections = (connectionsByWorkspace[workspaceId] ?? []).filter(
    (row) => isUiConnectedStatus(row.status),
  );
  useEffect(() => {
    setBlocks(emptyComposerBlocks());
    setMenu(null);
    focusedTextKeyRef.current = null;
    textCursorRef.current = 0;
  }, [threadId]);

  const focusTextKey = (key: string, cursor?: number) => {
    focusedTextKeyRef.current = key;
    window.requestAnimationFrame(() => {
      const el = textInputRefs.current.get(key);
      if (!el) return;
      el.focus();
      const pos =
        cursor == null ? el.value.length : Math.min(cursor, el.value.length);
      try {
        el.setSelectionRange(pos, pos);
      } catch {
        /* ignore */
      }
      textCursorRef.current = pos;
    });
  };

  const toggleConnectorScope = (next: ComposerConnectorScope) => {
    setBlocks((current) => {
      const result = toggleConnectorInBlocks(
        current,
        next,
        focusedTextKeyRef.current,
        textCursorRef.current,
      );
      if (result.focusKey) {
        window.requestAnimationFrame(() => focusTextKey(result.focusKey!));
      }
      return result.blocks;
    });
  };

  const connectorScopePayload =
    connectorScopes.length > 0
      ? {
          selectedConnectionIds: connectorScopes.map((c) => c.connectionId),
          selectedConnectionId: connectorScopes[0]!.connectionId,
          scopedConnectorId: connectorScopes[0]!.connectorId,
        }
      : {};

  const [files, setFiles] = useState<ChatFileAttachment[]>([]);
  const [images, setImages] = useState<ChatImageAttachment[]>([]);
  const [dictateError, setDictateError] = useState(null as string | null);
  const [attachError, setAttachError] = useState(null as string | null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const photoLibRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const speechRef = useRef<SpeechSession | null>(null);
  const dictationRef = useRef<VoiceDictationSession | null>(null);
  /** After stop: insert into composer; after send-while-recording: send immediately. */
  const afterTranscriptionRef = useRef<"insert" | "send">("insert");
  /** OpenAI dictation still starting (getUserMedia in flight). */
  const dictationStartingRef = useRef(false);
  /** Stop/send tapped before MediaRecorder session is ready. */
  const pendingStopIntentRef = useRef<"insert" | "send" | null>(null);
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
    setMenu((current) => {
      const next = current === id ? null : id;
      if (next) {
        // Opening + must not dismiss the soft keyboard.
        queueMicrotask(() => {
          textRef.current?.focus({ preventScroll: true });
        });
      }
      return next;
    });
  };

  const keepComposerKeyboard = () => {
    const el = textRef.current;
    if (!el) return;
    try {
      el.focus({ preventScroll: true });
    } catch {
      /* ignore */
    }
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
    dictationStartingRef.current = false;
    pendingStopIntentRef.current = null;
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
        ...connectorScopePayload,
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
    afterTranscriptionRef.current = intent;

    const session = dictationRef.current;
    if (session) {
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
      return;
    }

    if (speechRef.current) {
      speechRef.current.stop();
      speechRef.current = null;
      setDictating(false);
      setTranscribing(false);
      if (intent === "send") {
        window.setTimeout(() => submit(), 0);
      }
      return;
    }

    if (dictationStartingRef.current) {
      pendingStopIntentRef.current = intent;
      setDictating(false);
      setTranscribing(true);
      return;
    }

    cancelDictation();
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
      ...connectorScopePayload,
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

    const useOpenAI = isOpenAIDictationSupported();
    if (useOpenAI) {
      const t0 = performance.now();
      logDictationTiming("mic_button_clicked", t0);
      valueBaseRef.current = value.trim() ? `${value.trim()} ` : "";
      // Show recording UI immediately — do not wait for getUserMedia
      setDictating(true);
      setDictationMeter(null);
      dictationStartingRef.current = true;
      pendingStopIntentRef.current = null;
      // Keep textarea focused so the soft keyboard stays open under the overlay.
      keepComposerKeyboard();
      logDictationTiming("recording_ui_visible", t0);
      dictationRef.current?.cancel();
      void startVoiceDictation({
        t0,
        onError: (message) => {
          dictationStartingRef.current = false;
          pendingStopIntentRef.current = null;
          setDictateError(message);
          setDictating(false);
          setTranscribing(false);
          setDictationMeter(null);
          dictationRef.current = null;
        },
      })
        .then((session) => {
          dictationStartingRef.current = false;
          dictationRef.current = session;
          setDictationMeter(session.getMeter());
          const pending = pendingStopIntentRef.current;
          pendingStopIntentRef.current = null;
          if (pending) {
            stopDictationAndTranscribe(pending);
            return;
          }
          // Mic permission / getUserMedia often steals focus — reclaim it.
          keepComposerKeyboard();
          window.setTimeout(keepComposerKeyboard, 50);
          window.setTimeout(keepComposerKeyboard, 250);
        })
        .catch((e) => {
          dictationStartingRef.current = false;
          pendingStopIntentRef.current = null;
          setDictateError(
            e instanceof Error ? e.message : "Couldn’t start recording.",
          );
          setDictating(false);
          setTranscribing(false);
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
    keepComposerKeyboard();
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

  // Soft keyboard must stay up for the whole dictation / transcribing session.
  useEffect(() => {
    if (!dictatingActive) return;
    keepComposerKeyboard();
    const id = window.setInterval(keepComposerKeyboard, 350);
    return () => window.clearInterval(id);
  }, [dictatingActive]);
  const hint =
    placeholder ??
    (activeConnector
      ? `Ask about ${activeConnector.name}…`
      : selectedId && !stayInPlace
        ? `Change the ${labelFor(selectedId)}…`
        : APP_MESSAGE_PLACEHOLDER);

  /** Split view / mobile: composer grows upward; controls stay on the bottom row. */
  const growUpward = mobile || panelMode !== "collapsed";

  return (
    <>
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
                  "composer-keyboard-pad pb-[max(0.75rem,calc(env(safe-area-inset-bottom)+0.7rem))] sm:pb-4",
                )
              : cn(
                  "px-4 sm:px-6",
                  "composer-keyboard-pad pb-[max(0.75rem,calc(env(safe-area-inset-bottom)+0.7rem))] sm:pb-4",
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
          <ComposerMenu mobile={mobile} openAbove={!landing}>
            <div>
              <MenuSection title="Add" />
              <MenuRow
                icon={<Paperclip className="h-full w-full" strokeWidth={1.75} />}
                label="Add photos & files"
                onClick={() => {
                  setAttachError(null);
                  setMenu(null);
                  if (nativeShell) {
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
                      openFilePicker(fileRef);
                    })();
                  } else if (
                    mobileWeb &&
                    attachActions.includes("choose_photo")
                  ) {
                    openFilePicker(photoLibRef);
                  } else {
                    openFilePicker(fileRef);
                  }
                }}
              />
              {!mobile && pinTarget ? (
                <MenuRow
                  icon={
                    <Pin
                      className={cn("h-full w-full", pinned && "fill-current")}
                      strokeWidth={1.75}
                    />
                  }
                  label={pinned ? "Unpin" : "Pin"}
                  description={
                    pinned
                      ? "Remove from your pins"
                      : "Pin this to the sidebar"
                  }
                  onClick={() => {
                    if (pinned) clearPin(pinTarget.kind, pinTarget.id);
                    else setPin(pinTarget.kind, pinTarget.id, "primary");
                    setMenu(null);
                  }}
                />
              ) : null}
              {!mobile && browserMode ? (
                <MenuRow
                  icon={<Link2 className="h-full w-full" strokeWidth={1.75} />}
                  label="Attach page"
                  description="Reference the current page"
                  onClick={() => {
                    attachBrowserReference();
                    setMenu(null);
                  }}
                />
              ) : null}
            </div>

            <div>
              <MenuSection title="Start" />
              <MenuRow
                icon={<Hammer className="h-full w-full" strokeWidth={1.75} />}
                label="Build"
                description="Start a build with this chat"
                onClick={() => {
                  setMenu(null);
                  setDraftAsDefaultChat("build");
                }}
              />
              <MenuRow
                icon={<Search className="h-full w-full" strokeWidth={1.75} />}
                label="Explore"
                description="Start a search with this chat"
                onClick={() => {
                  setMenu(null);
                  setDraftAsDefaultChat("research");
                }}
              />
              <MenuRow
                icon={
                  <MessageSquare className="h-full w-full" strokeWidth={1.75} />
                }
                label="Default chat"
                description="Add as default chat to spaces"
                onClick={() => {
                  setMenu(null);
                  setDraftAsDefaultChat("work");
                }}
              />
            </div>

            <div>
              <MenuSection title="Connectors" />
              {activeConnections.length === 0 ? (
                <p className="px-3 py-1 text-[11.5px] text-muted-foreground">
                  Connect an app in Connectors first.
                </p>
              ) : (
                activeConnections.map((row) => {
                  const catalog = connectors.find(
                    (c) => c.id === row.connectorId,
                  );
                  const label = catalog?.name ?? row.connectorId;
                  const description =
                    catalog?.description?.trim() || row.connectorId;
                  const selected = connectorScopes.some(
                    (c) => c.connectionId === row.id,
                  );
                  return (
                    <MenuRow
                      key={row.id}
                      compact
                      icon={
                        <ConnectorMark
                          id={catalog?.icon ?? row.connectorId}
                          size="nav"
                          className="!h-full !w-full"
                        />
                      }
                      label={label}
                      description={description}
                      selected={selected}
                      onClick={() => {
                        toggleConnectorScope({
                          connectionId: row.id,
                          connectorId: row.connectorId,
                          label,
                        });
                      }}
                    />
                  );
                })
              )}
            </div>
          </ComposerMenu>
        ) : null}

        {dictateError || attachError ? (
          <p className="mb-1 px-1 text-[12px] text-muted-foreground">
            {dictateError || attachError}
          </p>
        ) : null}

        {compact ? (
          <div className="composer-shell py-1.5 pr-1.5 pl-3">
            <div className={cn("relative", dictatingActive && "h-9")}>
              {dictatingActive ? (
                <div className="absolute inset-0 z-10 flex items-center">
                  <ComposerRecordingView
                    compact
                    status={transcribing ? "transcribing" : "recording"}
                    meter={dictationMeter}
                    onCancel={cancelDictation}
                    onStop={() => stopDictationAndTranscribe("insert")}
                    onSend={() => stopDictationAndTranscribe("send")}
                  />
                </div>
              ) : null}
              <div
                className={cn(
                  "flex h-9 items-center gap-0.5",
                  dictatingActive && "invisible pointer-events-none",
                )}
                aria-hidden={dictatingActive || undefined}
              >
                <textarea
                  ref={(el) => {
                    textRef.current = el;
                  }}
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
                    if (dictatingActive) {
                      event.preventDefault();
                      return;
                    }
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
                  turnActive={turnActive}
                  onStartDictation={startDictation}
                  onSend={submit}
                  onStop={stopTurn}
                />
              </div>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              "composer-shell px-2.5",
              mobile ? "py-1.5" : "py-2",
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
            <div className={cn("relative", dictatingActive && "h-8 overflow-hidden")}>
              {dictatingActive ? (
                <div className="absolute inset-0 z-10 flex items-center">
                  <ComposerRecordingView
                    status={transcribing ? "transcribing" : "recording"}
                    meter={dictationMeter}
                    onCancel={cancelDictation}
                    onStop={() => stopDictationAndTranscribe("insert")}
                    onSend={() => stopDictationAndTranscribe("send")}
                  />
                </div>
              ) : null}
            <div
              className={cn(
                "flex min-h-8 gap-1",
                growUpward
                  ? "items-end"
                  : hasText
                    ? "items-start"
                    : "items-center",
                dictatingActive && "invisible pointer-events-none",
              )}
              aria-hidden={dictatingActive || undefined}
            >
              <ToolBtn
                label="Add"
                active={menu === "plus"}
                emphasize
                onClick={() => toggleMenu("plus")}
              >
                <Plus className="h-5 w-5" strokeWidth={2.25} />
              </ToolBtn>
              <div
                className={cn(
                  "flex min-h-8 min-w-0 flex-1 flex-wrap content-center items-center gap-x-1 gap-y-0.5",
                  hasText || connectorScopes.length ? "py-1" : "py-[6px]",
                  transcriptReveal && "opacity-100 transition-opacity duration-200",
                )}
                onMouseDown={(event) => {
                  // Clicking padding focuses the last text segment.
                  if (event.target === event.currentTarget) {
                    const last = [...blocks]
                      .reverse()
                      .find((b) => b.type === "text");
                    if (last) focusTextKey(last.key);
                  }
                }}
              >
                {blocks.map((block, index) => {
                  if (block.type === "connector") {
                    const iconId =
                      connectors.find((c) => c.id === block.scope.connectorId)
                        ?.icon ?? block.scope.connectorId;
                    return (
                      <button
                        key={block.key}
                        type="button"
                        aria-label={`Remove ${block.scope.label}`}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() =>
                          setBlocks((current) =>
                            removeConnectorBlock(
                              current,
                              block.scope.connectionId,
                            ),
                          )
                        }
                        className="inline-flex max-w-full shrink-0 items-center gap-1 rounded-md px-0.5 text-[14px] text-sky-500/95 dark:text-sky-400/95"
                      >
                        <ConnectorMark
                          id={iconId}
                          size="nav"
                          className="!h-[0.9em] !w-[0.9em]"
                        />
                        <span className="truncate font-medium leading-none">
                          {block.scope.label}
                        </span>
                      </button>
                    );
                  }

                  const isLastText =
                    !blocks.slice(index + 1).some((b) => b.type === "text");
                  const showPlaceholder =
                    blocks.length === 1 && block.value.length === 0;
                  const collapsed = !block.value && !isLastText;
                  const widthCh = Math.max(block.value.length + 1, 1);

                  return (
                    <input
                      key={block.key}
                      ref={(el) => {
                        if (el) {
                          textInputRefs.current.set(block.key, el);
                          if (isLastText) textRef.current = el;
                        } else {
                          textInputRefs.current.delete(block.key);
                        }
                      }}
                      value={block.value}
                      size={1}
                      placeholder={showPlaceholder ? hint : undefined}
                      autoFocus={autoFocus && isLastText && index === 0}
                      enterKeyHint="send"
                      autoComplete="off"
                      onFocus={(event) => {
                        focusedTextKeyRef.current = block.key;
                        textCursorRef.current = event.target.selectionStart ?? 0;
                        suppressAutoFocusRef.current = false;
                        onFocus?.();
                        if (!isLastText) return;
                        window.setTimeout(() => {
                          event.target.scrollIntoView({
                            block: "nearest",
                            inline: "nearest",
                          });
                          window.scrollTo(0, 0);
                        }, 50);
                      }}
                      onSelect={(event) => {
                        textCursorRef.current =
                          event.currentTarget.selectionStart ?? 0;
                      }}
                      onChange={(event) => {
                        if (dictatingActive) return;
                        const next = event.target.value;
                        textCursorRef.current =
                          event.target.selectionStart ?? next.length;
                        setBlocks((current) =>
                          updateTextBlock(current, block.key, next),
                        );
                        if (landing || stayInPlace) return;
                        if (projectId) return;
                        if (next.trim() && isChatSpace(spaceId)) {
                          armChatInterface(spaceId);
                        } else if (
                          !next.trim() &&
                          !thread &&
                          connectorsFromBlocks(blocks).length === 0
                        ) {
                          collapseDraft();
                        }
                      }}
                      onKeyDown={(event) => {
                        if (dictatingActive) {
                          event.preventDefault();
                          return;
                        }
                        textCursorRef.current =
                          event.currentTarget.selectionStart ?? 0;
                        if (
                          event.key === "Backspace" &&
                          event.currentTarget.selectionStart === 0 &&
                          event.currentTarget.selectionEnd === 0 &&
                          block.value.length === 0
                        ) {
                          const removed = backspaceRemoveConnector(
                            blocks,
                            block.key,
                          );
                          if (removed) {
                            event.preventDefault();
                            setBlocks(removed.blocks);
                            if (removed.focusKey) {
                              focusTextKey(removed.focusKey);
                            }
                            return;
                          }
                        }
                        if (
                          event.key === "/" &&
                          value === "" &&
                          !event.metaKey &&
                          !event.ctrlKey
                        ) {
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
                        "bg-transparent text-[16px] leading-5 outline-none placeholder:text-muted-foreground sm:text-[14px]",
                        isLastText
                          ? "min-w-0 flex-1 basis-[3ch]"
                          : collapsed
                            ? "w-0 max-w-0 overflow-hidden p-0"
                            : "shrink-0",
                      )}
                      style={
                        isLastText || collapsed
                          ? undefined
                          : {
                              width: `${widthCh}ch`,
                              maxWidth: "100%",
                            }
                      }
                    />
                  );
                })}
              </div>
              <div
                className={cn(
                  "flex shrink-0 items-center gap-0.5",
                  growUpward
                    ? "self-end"
                    : hasText || connectorScopes.length
                      ? "self-start"
                      : "self-center",
                )}
              >
                <ComposerTrailingActions
                  canSend={hasPayload}
                  hasVoice={entitlements.hasVoice}
                  turnActive={turnActive}
                  onStartDictation={startDictation}
                  onSend={submit}
                  onStop={stopTurn}
                />
              </div>
            </div>
            </div>
          </div>
        )}

      </div>
    </form>
    {/* Outside <form> so iOS doesn’t show the prev/next accessory bar above the keyboard. */}
    <input
      ref={fileRef}
      type="file"
      multiple
      accept={mobile ? DOCUMENT_ACCEPT : ANY_ATTACH_ACCEPT}
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
    </>
  );
}

function ComposerMenu({
  children,
  mobile = false,
  openAbove = true,
}: {
  children: ReactNode;
  mobile?: boolean;
  /** When true (docked chat), menu opens above and Add stays nearest the box. */
  openAbove?: boolean;
}) {
  return (
    <div
      role="menu"
      className={cn(
        "absolute z-50 flex flex-col gap-1 overflow-y-auto px-1.5 py-2 shadow-[0_12px_40px_rgba(0,0,0,0.28)]",
        openAbove
          ? "inset-x-0 bottom-[calc(100%+8px)]"
          : "inset-x-0 top-[calc(100%+8px)]",
        mobile
          ? "max-h-[min(20rem,42vh)] rounded-[18px] border border-white/10 bg-popover/92 backdrop-blur-xl dark:bg-zinc-900/90"
          : "max-h-[min(22rem,48vh)] light-surface shell-g3-radius bg-popover dark:bg-zinc-900",
      )}
    >
      {children}
    </div>
  );
}

function MenuSection({ title }: { title: string }) {
  return (
    <div className="px-3 pb-0.5 pt-2.5 text-[12.5px] font-semibold tracking-[-0.01em] text-muted-foreground first:pt-1.5">
      {title}
    </div>
  );
}

function MenuRow({
  icon,
  label,
  description,
  selected = false,
  compact = false,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  description?: string;
  selected?: boolean;
  compact?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      aria-pressed={selected || undefined}
      data-active={selected ? "true" : undefined}
      onPointerDown={(event) => {
        // Keep the soft keyboard open while choosing an attach action.
        event.preventDefault();
      }}
      onClick={onClick}
        className={cn(
          "composer-plus-row flex w-full items-center text-left outline-none transition-colors duration-150",
          compact
            ? "gap-2 rounded-[10px] px-3 py-1"
            : "gap-2.5 rounded-[12px] px-3 py-[5px]",
          selected && "bg-foreground/[0.08] dark:bg-white/10",
        )}
    >
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center overflow-hidden text-foreground",
          compact ? "h-[12px] w-[12px] text-[12.5px]" : "h-[13px] w-[13px] text-[13.5px]",
        )}
      >
        {icon}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate tracking-[-0.01em]",
          compact ? "text-[12.5px]" : "text-[13.5px]",
        )}
      >
        <span className="font-medium text-foreground">{label}</span>
        {description ? (
          <span className="font-normal text-muted-foreground">
            <span className="mx-1.5 text-muted-foreground/40"> </span>
            {description}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function ToolBtn({
  children,
  label,
  onClick,
  active,
  size = "md",
  emphasize = false,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  size?: "md" | "sm";
  /** Emphasized plus control (all platforms). */
  emphasize?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={(event) => {
        event.preventDefault();
      }}
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg transition-colors duration-200",
        emphasize
          ? "text-foreground hover:bg-foreground/10 dark:text-white dark:hover:bg-white/10"
          : "text-muted-foreground hover:bg-muted hover:text-foreground dark:hover:bg-background",
        // Keep plus on the same h-8 axis as mic/send; icon can still read larger.
        size === "sm" ? "h-7 w-7" : "h-8 w-8",
        active &&
          (emphasize
            ? "bg-foreground/10 text-foreground dark:bg-white/15 dark:text-white"
            : "bg-muted text-foreground dark:bg-background"),
      )}
    >
      {children}
    </button>
  );
}
