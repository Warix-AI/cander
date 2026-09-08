"use client";

import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";
import {
  FileText,
  Link2,
  MessageSquare,
  Paperclip,
  Pin,
  Plus,
  CornerDownLeft,
  X,
} from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { ReferenceChip } from "@/components/shell/ReferenceChip";
import {
  ComposerRecordingView,
  ComposerTrailingActions,
} from "@/components/shell/ComposerVoice";
import { connectors } from "@/lib/data";
import { APP_MESSAGE_PLACEHOLDER } from "@/lib/app-brand";
import {
  browsingFocusComposerPlaceholder,
  getBrowsingFocusServerSnapshot,
  getBrowsingFocusSnapshot,
  subscribeBrowsingFocus,
} from "@/lib/browser-context/browsing-focus";
import {
  connectorFocusComposerPlaceholder,
  getConnectorFocusServerSnapshot,
  getConnectorFocusSnapshot,
  subscribeConnectorFocus,
} from "@/lib/connector-focus";
import { connectionsForConnectorLive } from "@/lib/connector-connections-store";
import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import {
  isSpaceLibrarySpace,
  spaceLibraryLabel,
  type SpaceLibraryId,
} from "@/lib/space-library";
import { isChatSpace } from "@/lib/spaces";
import { canvasStartOptions } from "@/lib/canvas-start-options";
import {
  isSpaceAttachedChat,
  threadHasTurns,
} from "@/lib/persistent-chat";
import { useCreateProjectFlow } from "@/components/spaces/use-create-project-flow";
import {
  detectConnectorMentions,
  relatedCandidatesForTrigger,
  syncDetectedConnectorBlocks,
} from "@/lib/composer-connector-detect";
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
import { dismissNativeKeyboard } from "@/lib/mobile-shell";
import {
  isSpeechToTextSupported,
  startSpeechToText,
  type SpeechSession,
} from "@/lib/voice/speech-to-text";
import {
  isOpenAIDictationSupported,
  startVoiceDictation,
  type VoiceDictationSession,
} from "@/lib/voice/openai-live-dictation";
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
  promoteTriggerToConnector,
  removeConnectorBlockRestoringText,
  serializeComposerBlocks,
  textFromBlocks,
  toggleConnectorInBlocks,
  updateTextBlock,
  type ComposerBlock,
  type ComposerConnectorScope,
  type ComposerTriggerBlock,
} from "@/lib/composer-blocks";
import {
  ComposerEditableSurface,
  caretPlainOffset,
  composerPlainOffsetForTextKey,
  setCaretPlainOffset,
} from "@/components/shell/ComposerEditableSurface";
import { createComposerSpeculationController } from "@/lib/ai/composer-speculation/controller";
import { isComposerSpeculationEnabled } from "@/lib/ai/composer-speculation/flags";
import {
  clearComposerDraft,
  composerDraftKey,
  isComposerDraftThreadMigration,
  migrateComposerDraft,
  readComposerDraft,
  writeComposerDraft,
  type ComposerDraftSnapshot,
} from "@/lib/composer-draft-store";

/** Grow composer text to N lines, then scroll. */
function syncComposerFieldHeight(el: HTMLTextAreaElement, maxLines: number) {
  const styles = getComputedStyle(el);
  const lineHeight = Number.parseFloat(styles.lineHeight) || 20;
  const padY =
    (Number.parseFloat(styles.paddingTop) || 0) +
    (Number.parseFloat(styles.paddingBottom) || 0);
  const minHeight = Math.max(32, lineHeight + padY);
  el.style.height = "0px";
  const next = Math.min(
    lineHeight * maxLines + padY,
    Math.max(minHeight, el.scrollHeight),
  );
  el.style.height = `${next}px`;
}

/** Size inline (non-last) text segments to the rendered content width. */
function syncComposerSegmentWidth(el: HTMLInputElement) {
  el.style.minWidth = "0px";
  el.style.width = "0px";
  // Measure with a mirror so we don't inherit the input's default size=20 min box.
  const cs = getComputedStyle(el);
  const mirror = document.createElement("span");
  mirror.setAttribute("aria-hidden", "true");
  mirror.style.cssText = [
    "position:absolute",
    "left:-9999px",
    "top:0",
    "visibility:hidden",
    "white-space:pre",
    `font:${cs.font}`,
    `letter-spacing:${cs.letterSpacing}`,
    `text-transform:${cs.textTransform}`,
  ].join(";");
  mirror.textContent = el.value || "";
  document.body.appendChild(mirror);
  const width = Math.ceil(mirror.getBoundingClientRect().width);
  mirror.remove();
  el.style.width = `${Math.max(width, el.value ? 1 : 0)}px`;
}

function focusComposerTextEnd(el: HTMLSpanElement | HTMLTextAreaElement | HTMLElement) {
  el.focus({ preventScroll: true });
  if (el instanceof HTMLTextAreaElement) {
    const end = el.value.length;
    el.setSelectionRange(end, end);
    return;
  }
  setCaretPlainOffset(el, 10_000);
}

export type { ComposerConnectorScope };

type MenuId = "plus" | null;

type TriggerPickerState = {
  triggerKey: string;
  /** Anchor for the floating choice list. */
  rect: { left: number; top: number; width: number; height: number };
};

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
      steered?: boolean;
      composerConnectors?: Array<{
        connectionId: string;
        connectorId: string;
        label: string;
      }> | null;
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
    setDraftAsDefaultChat,
    openQuickSearchBrowser,
    openProject,
    jobId,
    skillId,
    standaloneBrowserOpen,
    mobileSurface,
  } = useApp();
  const { openCreate, modal: createModal } = useCreateProjectFlow(
    (projectId) => {
      openProject(projectId, {
        migrateFromThreadId: threadId,
        landOnPanel: true,
      });
    },
  );
  const floating = useShellStyle() === "floating";
  const mobile = useMobileShell();
  const { centered, chatMaxWidthClass } = useChatCanvasCentered();

  const detachedUnattached =
    view === "chat" &&
    !spaceId &&
    !projectId &&
    !connectorId &&
    Boolean(threadId) &&
    Boolean(thread) &&
    !isSpaceAttachedChat(thread, workspaceId);
  /** Start lives in the right panel on New; only orphan Recents chats get it in +. */
  const showStartInPlus =
    detachedUnattached &&
    !drafting &&
    panelMode === "collapsed" &&
    threadHasTurns(thread);

  const draftKey = useMemo(
    () =>
      composerDraftKey({
        workspaceId,
        view,
        spaceId,
        threadId,
        projectId,
        connectorId,
        jobId,
        skillId,
        browser:
          view === "browser"
            ? "view"
            : standaloneBrowserOpen
              ? "standalone"
              : null,
      }),
    [
      workspaceId,
      view,
      spaceId,
      threadId,
      projectId,
      connectorId,
      jobId,
      skillId,
      standaloneBrowserOpen,
    ],
  );
  const draftKeyRef = useRef(draftKey);
  const skipPersistRef = useRef(false);

  const [blocks, setBlocks] = useState<ComposerBlock[]>(() => {
    const snap = readComposerDraft(draftKey);
    return snap?.blocks ?? emptyComposerBlocks();
  });
  const value = textFromBlocks(blocks);
  const serializedValue = serializeComposerBlocks(blocks);
  const connectorScopes = connectorsFromBlocks(blocks);
  const hasInlineAtoms = blocks.some(
    (b) => b.type === "connector" || b.type === "trigger",
  );

  /** Connector ids the user removed (X) while the trigger word is still present. */
  const [dismissedConnectorIds, setDismissedConnectorIds] = useState(
    () => new Set(readComposerDraft(draftKey)?.dismissedConnectorIds ?? []),
  );
  /** Connector ids added via the + menu — keep even if the word is removed. */
  const [manualConnectorIds, setManualConnectorIds] = useState(
    () => new Set(readComposerDraft(draftKey)?.manualConnectorIds ?? []),
  );
  const [dictating, setDictating] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [dictationMeter, setDictationMeter] = useState<AudioMeter | null>(null);
  /** Brief ChatGPT-style “Steer” flash when redirecting mid-reply. */
  const [steerFlash, setSteerFlash] = useState(false);
  const steerFlashTimerRef = useRef<number | null>(null);
  const [liveSpeechMode, setLiveSpeechMode] = useState(false);
  const [transcriptReveal, setTranscriptReveal] = useState(false);
  const [menu, setMenu] = useState<MenuId>(null);
  const [triggerPicker, setTriggerPicker] = useState<TriggerPickerState | null>(
    null,
  );
  const focusedTextKeyRef = useRef<string | null>(null);
  const textCursorRef = useRef(0);
  const textInputRefs = useRef<Map<string, HTMLSpanElement>>(new Map());
  const textRef = useRef<HTMLSpanElement | HTMLTextAreaElement | null>(null);
  const registerTextEl = (key: string, el: HTMLSpanElement | null) => {
    if (el) textInputRefs.current.set(key, el);
    else textInputRefs.current.delete(key);
  };
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
  const detectCandidates = activeConnections.map((row) => {
    const catalog = connectors.find((c) => c.id === row.connectorId);
    return {
      connectionId: row.id,
      connectorId: row.connectorId,
      label: catalog?.name ?? row.connectorId,
    };
  });
  const detectedMentions = detectConnectorMentions(value, detectCandidates);

  const focusTextKey = (key: string, cursor?: number) => {
    focusedTextKeyRef.current = key;
    const apply = () => {
      const editable = document.querySelector(
        ".composer-shell [role='textbox'][contenteditable='true']",
      ) as HTMLElement | null;
      if (editable) {
        const pos = composerPlainOffsetForTextKey(
          blocksLiveRef.current,
          key,
          cursor ?? 0,
        );
        setCaretPlainOffset(editable, pos);
        textCursorRef.current = pos;
        textRef.current = editable;
        return true;
      }
      const el = textInputRefs.current.get(key);
      if (!el) return false;
      if (el instanceof HTMLTextAreaElement) {
        const len = el.value.length;
        const pos = cursor == null ? len : Math.min(cursor, len);
        el.focus({ preventScroll: true });
        el.setSelectionRange(pos, pos);
        textCursorRef.current = pos;
        textRef.current = el;
        return true;
      }
      return false;
    };
    window.requestAnimationFrame(() => {
      if (apply()) return;
      window.requestAnimationFrame(() => {
        apply();
      });
    });
  };

  // Auto-attach connected apps when their name / alias appears in the draft.
  useEffect(() => {
    if (dictating || transcribing) return;
    setDismissedConnectorIds((prev) => {
      if (!prev.size) return prev;
      const still = new Set(
        [...prev].filter((id) =>
          detectedMentions.some((m) => m.connectorId === id),
        ),
      );
      if (still.size === prev.size && [...still].every((id) => prev.has(id))) {
        return prev;
      }
      return still;
    });
    setBlocks((current) => {
      const result = syncDetectedConnectorBlocks(current, detectedMentions, {
        dismissedConnectorIds,
        manualConnectorIds,
      });
      if (result.focusKey) {
        const key = result.focusKey;
        const cursor = result.cursor;
        queueMicrotask(() => focusTextKey(key, cursor));
      }
      return result.blocks;
    });
    // detectedMentions is derived from value + connections; include those deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional fingerprint
  }, [
    value,
    dictating,
    transcribing,
    workspaceId,
    activeConnections
      .map((row) => `${row.id}:${row.connectorId}`)
      .join("|"),
    [...dismissedConnectorIds].sort().join("|"),
    [...manualConnectorIds].sort().join("|"),
  ]);

  const toggleConnectorScope = (next: ComposerConnectorScope) => {
    const removing = connectorScopes.some(
      (c) => c.connectionId === next.connectionId,
    );
    setManualConnectorIds((prev) => {
      const copy = new Set(prev);
      if (removing) copy.delete(next.connectorId);
      else copy.add(next.connectorId);
      return copy;
    });
    setDismissedConnectorIds((prev) => {
      if (!prev.has(next.connectorId)) return prev;
      const copy = new Set(prev);
      copy.delete(next.connectorId);
      return copy;
    });
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

  const dismissConnectorChip = (scope: ComposerConnectorScope) => {
    setManualConnectorIds((prev) => {
      if (!prev.has(scope.connectorId)) return prev;
      const copy = new Set(prev);
      copy.delete(scope.connectorId);
      return copy;
    });
    setDismissedConnectorIds((prev) => {
      const copy = new Set(prev);
      copy.add(scope.connectorId);
      return copy;
    });
    setTriggerPicker(null);
    setBlocks((current) =>
      removeConnectorBlockRestoringText(current, scope.connectionId),
    );
  };

  const applyTriggerConnector = (
    trigger: ComposerTriggerBlock,
    scope: ComposerConnectorScope,
  ) => {
    setTriggerPicker(null);
    setDismissedConnectorIds((prev) => {
      if (!prev.size) return prev;
      const copy = new Set(prev);
      copy.delete(trigger.preferredConnectorId);
      copy.delete(scope.connectorId);
      return copy;
    });
    setManualConnectorIds((prev) => {
      const copy = new Set(prev);
      copy.add(scope.connectorId);
      return copy;
    });
    setBlocks((current) => {
      const result = promoteTriggerToConnector(current, trigger.key, scope);
      if (result.focusKey) {
        queueMicrotask(() => focusTextKey(result.focusKey!));
      }
      return result.blocks;
    });
  };

  const onTriggerWordClick = (
    trigger: ComposerTriggerBlock,
    anchor: HTMLElement,
  ) => {
    if (triggerPicker?.triggerKey === trigger.key) {
      setTriggerPicker(null);
      return;
    }
    const related = relatedCandidatesForTrigger(trigger, detectCandidates);
    if (!related.length) return;
    if (related.length === 1) {
      applyTriggerConnector(trigger, related[0]!);
      return;
    }
    const rect = anchor.getBoundingClientRect();
    setMenu(null);
    setTriggerPicker({
      triggerKey: trigger.key,
      rect: {
        left: rect.left,
        top: rect.bottom + 4,
        width: rect.width,
        height: rect.height,
      },
    });
  };

  useEffect(() => {
    if (!triggerPicker) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (
        target &&
        (target as Element).closest?.("[data-composer-trigger-picker]")
      ) {
        return;
      }
      if (
        target &&
        (target as Element).closest?.("[data-composer-trigger-word]")
      ) {
        return;
      }
      setTriggerPicker(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTriggerPicker(null);
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [triggerPicker]);

  useEffect(() => {
    return () => {
      if (steerFlashTimerRef.current) {
        window.clearTimeout(steerFlashTimerRef.current);
      }
    };
  }, []);

  const connectorScopePayload =
    connectorScopes.length > 0
      ? {
          selectedConnectionIds: connectorScopes.map((c) => c.connectionId),
          selectedConnectionId: connectorScopes[0]!.connectionId,
          scopedConnectorId: connectorScopes[0]!.connectorId,
          composerConnectors: connectorScopes.map((c) => ({
            connectionId: c.connectionId,
            connectorId: c.connectorId,
            label: c.label,
          })),
        }
      : {};

  const [files, setFiles] = useState<ChatFileAttachment[]>(
    () => readComposerDraft(draftKey)?.files ?? [],
  );
  const [images, setImages] = useState<ChatImageAttachment[]>(
    () => readComposerDraft(draftKey)?.images ?? [],
  );
  const [dictateError, setDictateError] = useState(null as string | null);
  const [attachError, setAttachError] = useState(null as string | null);

  useEffect(() => {
    if (!dictateError) return;
    const timer = window.setTimeout(() => setDictateError(null), 4200);
    return () => window.clearTimeout(timer);
  }, [dictateError]);

  const speculationRef = useRef<ReturnType<
    typeof createComposerSpeculationController
  > | null>(null);
  const blocksLiveRef = useRef(blocks);
  const filesLiveRef = useRef(files);
  const imagesLiveRef = useRef(images);
  const dismissedLiveRef = useRef(dismissedConnectorIds);
  const manualLiveRef = useRef(manualConnectorIds);
  const dictatingLiveRef = useRef(dictating);
  const transcribingLiveRef = useRef(transcribing);
  const turnActiveLiveRef = useRef(turnActive);
  blocksLiveRef.current = blocks;
  filesLiveRef.current = files;
  imagesLiveRef.current = images;
  dismissedLiveRef.current = dismissedConnectorIds;
  manualLiveRef.current = manualConnectorIds;
  dictatingLiveRef.current = dictating;
  transcribingLiveRef.current = transcribing;
  turnActiveLiveRef.current = turnActive;

  useEffect(() => {
    if (skipPersistRef.current) {
      skipPersistRef.current = false;
      return;
    }
    const snap: ComposerDraftSnapshot = {
      blocks,
      dismissedConnectorIds: [...dismissedConnectorIds],
      manualConnectorIds: [...manualConnectorIds],
      files,
      images,
    };
    const timer = window.setTimeout(() => {
      writeComposerDraft(draftKeyRef.current, snap);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [blocks, dismissedConnectorIds, manualConnectorIds, files, images]);

  // Save / restore unsent drafts when leaving a space, project, connector, or chat.
  useEffect(() => {
    const prevKey = draftKeyRef.current;
    if (prevKey === draftKey) return;

    writeComposerDraft(prevKey, {
      blocks: blocksLiveRef.current,
      dismissedConnectorIds: [...dismissedLiveRef.current],
      manualConnectorIds: [...manualLiveRef.current],
      files: filesLiveRef.current,
      images: imagesLiveRef.current,
    });

    if (isComposerDraftThreadMigration(prevKey, draftKey)) {
      migrateComposerDraft(prevKey, draftKey);
    }

    const incoming = readComposerDraft(draftKey);
    skipPersistRef.current = true;
    setBlocks(incoming?.blocks ?? emptyComposerBlocks());
    setDismissedConnectorIds(
      new Set(incoming?.dismissedConnectorIds ?? []),
    );
    setManualConnectorIds(new Set(incoming?.manualConnectorIds ?? []));
    setFiles(incoming?.files ?? []);
    setImages(incoming?.images ?? []);
    setMenu(null);
    setTriggerPicker(null);
    focusedTextKeyRef.current = null;
    textCursorRef.current = 0;
    draftKeyRef.current = draftKey;
  }, [draftKey]);

  useEffect(() => {
    if (!isComposerSpeculationEnabled()) return;
    const controller = createComposerSpeculationController({
      getMeta: () => ({
        threadId,
        workspaceId,
        connectionIds: connectorsFromBlocks(blocksLiveRef.current).map(
          (c) => c.connectionId,
        ),
        attachmentCount:
          filesLiveRef.current.length + imagesLiveRef.current.length,
      }),
      shouldSkip: () =>
        Boolean(
          dictatingLiveRef.current ||
            transcribingLiveRef.current ||
            turnActiveLiveRef.current ||
            filesLiveRef.current.length > 0 ||
            imagesLiveRef.current.length > 0 ||
            connectorsFromBlocks(blocksLiveRef.current).length > 0,
        ),
    });
    speculationRef.current = controller;
    return () => {
      controller.dispose();
      speculationRef.current = null;
    };
  }, [threadId, workspaceId]);

  useEffect(() => {
    speculationRef.current?.onTextChange(value);
  }, [value]);

  useEffect(() => {
    if (dictating || transcribing) {
      speculationRef.current?.reset();
    }
  }, [dictating, transcribing]);

  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const photoLibRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
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
          const el = textRef.current;
          if (el) focusComposerTextEnd(el);
        });
        return;
      }
      const seed = consumeComposerSeed();
      if (!seed) return;
      setValue(seed);
      window.requestAnimationFrame(() => {
        const el = textRef.current;
        if (el) focusComposerTextEnd(el);
      });
    };
    if (peekComposerPendingInput() || peekComposerSeed()) apply();
    return subscribeComposerSeed(apply);
  }, []);

  // New / empty chat: reset sticky-keyboard lock when the session changes.
  useEffect(() => {
    suppressAutoFocusRef.current = false;
  }, [thread?.id]);

  useEffect(() => {
    const onSuppress = () => {
      suppressAutoFocusRef.current = true;
    };
    window.addEventListener("cander:suppress-composer-keyboard", onSuppress);
    return () =>
      window.removeEventListener("cander:suppress-composer-keyboard", onSuppress);
  }, []);

  // Sticky keyboard on mobile chat: stay up for dictation, +, and send unless
  // the user scrolls the transcript down (or leaves chat). Don't fight blur on
  // the scroll surface — ChatColumn dismisses on finger-down scroll.
  const raiseKeyboard =
    autoFocus && (!mobile || mobileSurface === "chat");
  const stickyKeyboard =
    mobile &&
    mobileSurface === "chat" &&
    !overlay &&
    view !== "browser";
  const prevSurfaceRef = useRef(mobileSurface);
  useEffect(() => {
    const fromMenu = prevSurfaceRef.current === "menu";
    const fromPanel = prevSurfaceRef.current === "panel";
    prevSurfaceRef.current = mobileSurface;

    if (!stickyKeyboard) return;
    if (suppressAutoFocusRef.current) return;

    const focusComposer = () => {
      if (suppressAutoFocusRef.current) return;
      if (prevSurfaceRef.current !== "chat") return;
      keepComposerKeyboard();
    };

    // Menu overlays; panel slides the chat pane back on-screen. Retry so iOS
    // raises the keyboard after pointer-events / transform settle.
    const delays =
      fromMenu || fromPanel ? [560, 720, 920] : raiseKeyboard ? [0, 80] : [];
    const openIds = delays.map((ms) => window.setTimeout(focusComposer, ms));

    const holdKeyboard = (event: TouchEvent) => {
      if (suppressAutoFocusRef.current) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      // Composer (+ attach/send/dictation/plus) and header chrome must stay interactive.
      if (wrapRef.current?.contains(target)) return;
      if (
        target.closest(
          "header, .chat-scroll, [data-allow-keyboard-dismiss], [data-composer-keep-keyboard], [data-header-actions-menu], [data-header-actions-dismiss]",
        )
      )
        return;
      // Keep the soft keyboard up — don't let the tap steal focus.
      event.preventDefault();
    };

    document.addEventListener("touchstart", holdKeyboard, {
      capture: true,
      passive: false,
    });

    return () => {
      for (const id of openIds) window.clearTimeout(id);
      document.removeEventListener("touchstart", holdKeyboard, true);
    };
  }, [stickyKeyboard, raiseKeyboard, mobileSurface, overlay, view, thread?.id]);

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
        try {
          getNativeCapabilities().haptics.impact("select");
        } catch {
          /* never block */
        }
        // Opening + must not dismiss the soft keyboard.
        queueMicrotask(() => keepComposerKeyboard());
        window.setTimeout(keepComposerKeyboard, 50);
        window.setTimeout(keepComposerKeyboard, 200);
      }
      return next;
    });
  };

  const keepComposerKeyboard = () => {
    const el =
      textRef.current ??
      (document.querySelector(
        ".composer-shell [role='textbox'][contenteditable='true']",
      ) as HTMLElement | null) ??
      (document.querySelector(
        ".composer-shell textarea",
      ) as HTMLElement | null);
    if (!el) return;
    try {
      el.focus({ preventScroll: true });
      textRef.current = el;
    } catch {
      /* ignore */
    }
    // Mic teardown often drops the soft keyboard while the field stays focused
    // (zombie focus). Explicitly re-raise on Capacitor.
    try {
      getNativeCapabilities().keyboard.show();
    } catch {
      /* never block */
    }
  };

  /** After send: collapse keyboard so ChatColumn can pin the turn under the header. */
  const dismissComposerKeyboardAfterSend = () => {
    suppressAutoFocusRef.current = true;
    dismissNativeKeyboard({ suppressComposer: true });
  };

  /** Re-raise after dictation stop — field flips off readOnly on the next paint. */
  const raiseComposerKeyboardAfterDictation = () => {
    suppressAutoFocusRef.current = false;
    keepComposerKeyboard();
    queueMicrotask(() => keepComposerKeyboard());
    for (const ms of [50, 80, 200, 320]) {
      window.setTimeout(keepComposerKeyboard, ms);
    }
    // If still zombie-focused with no keyboard, blur so the next tap can open it.
    window.setTimeout(() => {
      const el = textRef.current;
      if (!el || document.activeElement !== el) return;
      const inset =
        typeof document !== "undefined"
          ? Number.parseFloat(
              getComputedStyle(document.documentElement).getPropertyValue(
                "--keyboard-inset",
              ) || "0",
            )
          : 0;
      if (Number.isFinite(inset) && inset > 24) return;
      try {
        getNativeCapabilities().keyboard.show();
      } catch {
        /* ignore */
      }
      window.setTimeout(() => {
        const still = textRef.current;
        if (!still || document.activeElement !== still) return;
        const inset2 = Number.parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue(
            "--keyboard-inset",
          ) || "0",
        );
        if (Number.isFinite(inset2) && inset2 > 24) return;
        try {
          still.blur();
        } catch {
          /* ignore */
        }
      }, 120);
    }, 400);
  };

  const browserMode = view === "browser";
  const showLibrary =
    !!spaceId &&
    isSpaceLibrarySpace(spaceId) &&
    !thread &&
    !drafting &&
    !compact &&
    !hideSpaceTools;

  const stayInPlace = compact || hideSpaceTools;
  const dictatingActive = dictating || transcribing;
  const hasText = value.trim().length > 0 || connectorScopes.length > 0;
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
    try {
      getNativeCapabilities().haptics.impact("select");
    } catch {
      /* never block */
    }
    // Focus while still in the tap gesture — before mic release drops the keyboard.
    keepComposerKeyboard();
    dictationRef.current?.cancel();
    dictationRef.current = null;
    speechRef.current?.stop();
    speechRef.current = null;
    dictationStartingRef.current = false;
    pendingStopIntentRef.current = null;
    afterTranscriptionRef.current = "insert";
    setDictationMeter(null);
    setLiveSpeechMode(false);
    setDictating(false);
    setTranscribing(false);
    setDictateError(null);
    // Restore draft text that existed before dictation began
    if (valueBaseRef.current) {
      setValue(valueBaseRef.current.trimEnd());
    }
    raiseComposerKeyboardAfterDictation();
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
      const usableImages = images.filter((img) =>
        img.url?.startsWith("data:image/"),
      );
      const sendAttachments = toSendAttachments(usableImages, files);
      // Detect connectors from the final transcript before chips have synced.
      const liveMentions = detectConnectorMentions(next, detectCandidates).filter(
        (m) => !dismissedConnectorIds.has(m.connectorId),
      );
      let liveScopes =
        connectorScopes.length > 0
          ? connectorScopes
          : liveMentions.map((m) => ({
              connectionId: m.connectionId,
              connectorId: m.connectorId,
              label: m.label,
            }));
      if (
        liveScopes.length === 0 &&
        spaceId === "connectors" &&
        connectorId
      ) {
        const active = connectionsForConnectorLive(workspaceId, connectorId).find(
          (row) => isUiConnectedStatus(row.status),
        );
        if (active) {
          const catalog = connectors.find((c) => c.id === connectorId);
          liveScopes = [
            {
              connectionId: active.id,
              connectorId,
              label: catalog?.name ?? connectorId,
            },
          ];
        }
      }
      // Persistent one-chat-per-connector threads carry connectorId on the thread.
      if (liveScopes.length === 0 && thread?.connectorId) {
        const cid = thread.connectorId;
        const active = connectionsForConnectorLive(workspaceId, cid).find(
          (row) => isUiConnectedStatus(row.status),
        );
        if (active) {
          const catalog = connectors.find((c) => c.id === cid);
          liveScopes = [
            {
              connectionId: active.id,
              connectorId: cid,
              label: catalog?.name ?? cid,
            },
          ];
        }
      }
      // Ambient open-item focus (survives Chat|Panel toggles).
      if (liveScopes.length === 0) {
        const focus = getConnectorFocusSnapshot();
        if (focus?.connectorId) {
          const active = connectionsForConnectorLive(
            workspaceId,
            focus.connectorId,
          ).find((row) => isUiConnectedStatus(row.status));
          if (active) {
            liveScopes = [
              {
                connectionId: active.id,
                connectorId: focus.connectorId,
                label: focus.connectorLabel || focus.connectorId,
              },
            ];
          }
        }
      }
      // Swap trigger words for connector labels so the AI sees the app name.
      let spoken = next;
      for (const mention of [...liveMentions].sort(
        (a, b) => b.index - a.index,
      )) {
        spoken =
          spoken.slice(0, mention.index) +
          mention.label +
          spoken.slice(mention.index + mention.matched.length);
      }
      const body = `${refPrefix}${spoken}`.trim();
      const liveConnectorPayload =
        liveScopes.length > 0
          ? {
              selectedConnectionIds: liveScopes.map((c) => c.connectionId),
              selectedConnectionId: liveScopes[0]!.connectionId,
              scopedConnectorId: liveScopes[0]!.connectorId,
              composerConnectors: liveScopes.map((c) => ({
                connectionId: c.connectionId,
                connectorId: c.connectorId,
                label: c.label,
              })),
            }
          : {};
      if (!body && !usableImages.length && !files.length) {
        setValue(next);
        setDictateError(null);
        queueMicrotask(() => keepComposerKeyboard());
        return;
      }
      try {
        getNativeCapabilities().haptics.impact("send");
      } catch {
        /* never block send */
      }
      speculationRef.current?.prepareSend();
      onSend(body || "", {
        ...(usableImages.length ? { attachments: usableImages } : {}),
        ...(files.length ? { files } : {}),
        ...(sendAttachments.length ? { sendAttachments } : {}),
        ...liveConnectorPayload,
      });
      clearComposerDraft(draftKeyRef.current);
      setValue("");
      setFiles([]);
      setImages([]);
      setMenu(null);
      setDismissedConnectorIds(new Set());
      setManualConnectorIds(new Set());
      setDictateError(null);
      setAttachError(null);
      clearPageReference();
      clearEntityReference();
      // Collapse keyboard so the new user turn can pin under the header.
      dismissComposerKeyboardAfterSend();
      return;
    }

    setTranscriptReveal(true);
    setValue(next ? `${next} ` : "");
    window.setTimeout(() => {
      speculationRef.current?.onStabilizedText(next);
      setTranscriptReveal(false);
      const el = textRef.current;
      if (el) focusComposerTextEnd(el);
      keepComposerKeyboard();
    }, 180);
    window.setTimeout(keepComposerKeyboard, 320);
  };

  const stopDictationAndTranscribe = (intent: "insert" | "send" = "insert") => {
    afterTranscriptionRef.current = intent;
    try {
      getNativeCapabilities().haptics.impact(intent === "send" ? "send" : "select");
    } catch {
      /* never block */
    }
    // Hold focus in the tap gesture before async mic teardown.
    keepComposerKeyboard();

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
          const message =
            e instanceof Error ? e.message : "Transcription failed.";
          // Brief empty stop (or silent clip) — don't leave a sticky banner.
          if (
            /no speech detected|couldn'?t hear that/i.test(message) &&
            intent !== "send"
          ) {
            setDictateError(null);
            return;
          }
          setDictateError(message);
        })
        .finally(() => {
          dictationRef.current = null;
          setTranscribing(false);
          setDictating(false);
          setDictationMeter(null);
          raiseComposerKeyboardAfterDictation();
        });
      return;
    }

    if (speechRef.current) {
      speechRef.current.stop();
      speechRef.current = null;
      setLiveSpeechMode(false);
      setDictating(false);
      setTranscribing(false);
      setDictationMeter(null);
      if (valueBaseRef.current.trim()) {
        setValue(valueBaseRef.current);
      }
      if (intent === "send") {
        window.setTimeout(() => submit(), 0);
      } else {
        setTranscriptReveal(true);
        window.setTimeout(() => {
          setTranscriptReveal(false);
          const el = textRef.current;
          if (el) focusComposerTextEnd(el);
          raiseComposerKeyboardAfterDictation();
        }, 180);
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
    // Visible chat text = typed words with connector labels in chip slots.
    const body = `${refPrefix}${serializedValue}`.trim();
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
    // Mid-reply redirect: finalize the in-flight turn, flash Steer, then send.
    const steered = turnActive;
    if (steered) {
      stopTurn();
      if (steerFlashTimerRef.current) {
        window.clearTimeout(steerFlashTimerRef.current);
      }
      setSteerFlash(true);
      steerFlashTimerRef.current = window.setTimeout(() => {
        setSteerFlash(false);
        steerFlashTimerRef.current = null;
      }, 1200);
    }
    // Keep keyboard up after send — only scroll dismisses it in chat.
    try {
      getNativeCapabilities().haptics.impact("send");
    } catch {
      /* never block send */
    }
    // Detect connectors from live text so trigger words still scope the turn
    // even if the inline chip hasn't finished syncing (typed send / paste).
    const liveMentions = detectConnectorMentions(value, detectCandidates).filter(
      (m) => !dismissedConnectorIds.has(m.connectorId),
    );
    let liveScopes =
      connectorScopes.length > 0
        ? connectorScopes
        : liveMentions.map((m) => ({
            connectionId: m.connectionId,
            connectorId: m.connectorId,
            label: m.label,
          }));
    // Connector panel chat: prefer the open connector's MCP tools even without chips.
    if (
      liveScopes.length === 0 &&
      spaceId === "connectors" &&
      connectorId
    ) {
      const active = connectionsForConnectorLive(workspaceId, connectorId).find(
        (row) => isUiConnectedStatus(row.status),
      );
      if (active) {
        const catalog = connectors.find((c) => c.id === connectorId);
        liveScopes = [
          {
            connectionId: active.id,
            connectorId,
            label: catalog?.name ?? connectorId,
          },
        ];
      }
    }
    if (liveScopes.length === 0 && thread?.connectorId) {
      const cid = thread.connectorId;
      const active = connectionsForConnectorLive(workspaceId, cid).find(
        (row) => isUiConnectedStatus(row.status),
      );
      if (active) {
        const catalog = connectors.find((c) => c.id === cid);
        liveScopes = [
          {
            connectionId: active.id,
            connectorId: cid,
            label: catalog?.name ?? cid,
          },
        ];
      }
    }
    if (liveScopes.length === 0) {
      const focus = getConnectorFocusSnapshot();
      if (focus?.connectorId) {
        const active = connectionsForConnectorLive(
          workspaceId,
          focus.connectorId,
        ).find((row) => isUiConnectedStatus(row.status));
        if (active) {
          liveScopes = [
            {
              connectionId: active.id,
              connectorId: focus.connectorId,
              label: focus.connectorLabel || focus.connectorId,
            },
          ];
        }
      }
    }
    const liveConnectorPayload =
      liveScopes.length > 0
        ? {
            selectedConnectionIds: liveScopes.map((c) => c.connectionId),
            selectedConnectionId: liveScopes[0]!.connectionId,
            scopedConnectorId: liveScopes[0]!.connectorId,
            composerConnectors: liveScopes.map((c) => ({
              connectionId: c.connectionId,
              connectorId: c.connectorId,
              label: c.label,
            })),
          }
        : {};
    speculationRef.current?.prepareSend();
    onSend(body || "", {
      ...(usableImages.length ? { attachments: usableImages } : {}),
      ...(files.length ? { files } : {}),
      ...(sendAttachments.length ? { sendAttachments } : {}),
      ...liveConnectorPayload,
      ...(steered ? { steered: true } : {}),
    });
    clearComposerDraft(draftKeyRef.current);
    setValue("");
    setFiles([]);
    setImages([]);
    setMenu(null);
    setDismissedConnectorIds(new Set());
    setManualConnectorIds(new Set());
    setDictating(false);
    setTranscribing(false);
    setDictateError(null);
    setAttachError(null);
    clearPageReference();
    clearEntityReference();
    // Collapse keyboard so the new user turn can pin under the header.
    dismissComposerKeyboardAfterSend();
  };

  const startDictation = () => {
    if (!entitlements.hasVoice) return;
    setDictateError(null);
    setTranscribing(false);
    afterTranscriptionRef.current = "insert";
    valueBaseRef.current = value.trim() ? `${value.trim()} ` : "";
    try {
      getNativeCapabilities().haptics.impact("select");
    } catch {
      /* never block */
    }

    // OpenAI realtime streaming (silent accumulate → instant paste on stop).
    // Speech-to-text is last resort when MediaRecorder isn't available.
    if (isOpenAIDictationSupported()) {
      const t0 = performance.now();
      logDictationTiming("mic_button_clicked", t0);
      setLiveSpeechMode(false);
      setDictating(true);
      setDictationMeter(null);
      dictationStartingRef.current = true;
      pendingStopIntentRef.current = null;
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

    setLiveSpeechMode(false);
    setDictating(true);
    setDictationMeter(null);
    keepComposerKeyboard();
    speechRef.current?.stop();
    speechRef.current = startSpeechToText(
      {
        onPartial: () => {
          // Keep speech fallback silent in the UI — paste only on stop.
        },
        onFinal: (text) => {
          valueBaseRef.current = `${valueBaseRef.current}${text} `.replace(
            /\s+/g,
            " ",
          );
        },
        onError: (message) => {
          setDictateError(message);
        },
        onEnd: () => {
          setDictating(false);
          speechRef.current = null;
          if (valueBaseRef.current.trim()) {
            setValue(valueBaseRef.current);
          }
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
  // Keep the focused field in-DOM (opacity-0, not visibility:hidden) so iOS
  // doesn't drop the keyboard when the recording chrome overlays it.
  useEffect(() => {
    if (!dictatingActive) return;
    keepComposerKeyboard();
    const id = window.setInterval(keepComposerKeyboard, 200);
    const onVis = () => keepComposerKeyboard();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [dictatingActive]);
  const browsingFocus = useSyncExternalStore(
    subscribeBrowsingFocus,
    getBrowsingFocusSnapshot,
    getBrowsingFocusServerSnapshot,
  );
  const connectorFocus = useSyncExternalStore(
    subscribeConnectorFocus,
    getConnectorFocusSnapshot,
    getConnectorFocusServerSnapshot,
  );
  const browsingFocusHint =
    !pageReference && browsingFocus
      ? browsingFocusComposerPlaceholder(browsingFocus)
      : null;
  const connectorFocusHint =
    !pageReference && !browsingFocusHint && connectorFocus
      ? connectorFocusComposerPlaceholder(connectorFocus)
      : null;
  const hint =
    placeholder ??
    (selectedId && !stayInPlace
      ? `Change the ${labelFor(selectedId)}…`
      : browsingFocusHint ??
        connectorFocusHint ??
        APP_MESSAGE_PLACEHOLDER);

  /** Mobile / dock: 6 lines; desktop new-chat & shell: 8 lines. */
  const composerMaxLines = mobile || compact ? 6 : 8;

  useLayoutEffect(() => {
    const el = textRef.current;
    if (!(el instanceof HTMLTextAreaElement) || dictatingActive) return;
    syncComposerFieldHeight(el, composerMaxLines);
  }, [value, composerMaxLines, dictatingActive, blocks]);

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
          landing || compact || inDock ? "max-w-none" : chatMaxWidthClass,
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
        {steerFlash ? (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-full z-10 mb-2 flex justify-center"
            role="status"
            aria-live="polite"
          >
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/95 px-3 py-1 text-[12px] font-medium text-foreground shadow-sm backdrop-blur-sm">
              <CornerDownLeft className="h-3.5 w-3.5" strokeWidth={2} />
              Steer
            </span>
          </div>
        ) : null}
        {menu === "plus" && !compact ? (
          <ComposerMenu mobile={mobile} openAbove={!landing}>
            {showStartInPlus ? (
              <div>
                <MenuSection title="Start" />
                {canvasStartOptions().map((item) => {
                  const Icon = item.icon;
                  return (
                    <MenuRow
                      key={item.id}
                      icon={
                        <Icon className="h-full w-full" strokeWidth={1.75} />
                      }
                      label={item.label}
                      description={item.summary}
                      onClick={() => {
                        if (item.action === "quick-search") {
                          openQuickSearchBrowser();
                          setMenu(null);
                          return;
                        }
                        if (!item.space || !item.kind || !item.title) return;
                        openCreate({
                          space: item.space,
                          kind: item.kind,
                          defaultTitle: item.title,
                          summary: item.summary,
                        });
                        setMenu(null);
                      }}
                    />
                  );
                })}
              </div>
            ) : null}

            <div>
              <MenuSection title="Add" />
              {detachedUnattached ? (
                <MenuRow
                  icon={
                    <MessageSquare
                      className="h-full w-full"
                      strokeWidth={1.75}
                    />
                  }
                  label="Add to canvas chat"
                  description="Use this chat as Canvas default"
                  onClick={() => {
                    void setDraftAsDefaultChat("studio");
                    setMenu(null);
                  }}
                />
              ) : null}
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
        {createModal}

        {triggerPicker
          ? (() => {
              const trigger = blocks.find(
                (b): b is ComposerTriggerBlock =>
                  b.type === "trigger" && b.key === triggerPicker.triggerKey,
              );
              if (!trigger) return null;
              const related = relatedCandidatesForTrigger(
                trigger,
                detectCandidates,
              );
              if (related.length < 2) return null;
              return (
                <div
                  data-composer-trigger-picker
                  role="listbox"
                  aria-label="Choose connector"
                  className="fixed z-[80] min-w-[11rem] overflow-hidden rounded-xl border border-border/80 bg-popover p-1 shadow-lg"
                  style={{
                    left: Math.min(
                      triggerPicker.rect.left,
                      typeof window !== "undefined"
                        ? window.innerWidth - 188
                        : triggerPicker.rect.left,
                    ),
                    top: triggerPicker.rect.top,
                  }}
                >
                  {related.map((row) => {
                    const iconId =
                      connectors.find((c) => c.id === row.connectorId)?.icon ??
                      row.connectorId;
                    return (
                      <button
                        key={row.connectionId}
                        type="button"
                        role="option"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => applyTriggerConnector(trigger, row)}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-foreground transition-colors hover:bg-muted"
                      >
                        <ConnectorMark id={iconId} size="nav" className="!h-4 !w-4" />
                        <span>{row.label}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })()
          : null}

        {dictateError || attachError ? (
          <p className="mb-1 px-1 text-[12px] text-muted-foreground">
            {dictateError || attachError}
          </p>
        ) : null}

        {compact ? (
          <div className="composer-shell bg-transparent py-1.5 pr-1.5 pl-3 dark:bg-input">
            <div className={cn("relative", dictatingActive && "h-9")}>
              {dictatingActive ? (
                <div className="absolute inset-0 z-10 flex items-center">
                  <ComposerRecordingView
                    compact
                    status={transcribing ? "transcribing" : "recording"}
                    meter={dictationMeter}
                    liveText={liveSpeechMode ? value : null}
                    onCancel={cancelDictation}
                    onStop={() => stopDictationAndTranscribe("insert")}
                    onSend={() => stopDictationAndTranscribe("send")}
                  />
                </div>
              ) : null}
              <div
                className={cn(
                  "flex min-h-9 items-start gap-0.5",
                  dictatingActive && "opacity-0",
                )}
                aria-hidden={dictatingActive || undefined}
              >
                <textarea
                  ref={(el) => {
                    textRef.current = el;
                    if (el && !dictatingActive) {
                      syncComposerFieldHeight(el, composerMaxLines);
                    }
                  }}
                  value={value}
                  rows={1}
                  placeholder={hint}
                  autoFocus={raiseKeyboard}
                  onFocus={() => {
                    suppressAutoFocusRef.current = false;
                    onFocus?.();
                  }}
                  // Keep receiving focus while dictating (opacity-0 overlay).
                  readOnly={dictatingActive}
                  tabIndex={dictatingActive ? 0 : undefined}
                  onChange={(event) => {
                    setValue(event.target.value);
                    syncComposerFieldHeight(
                      event.currentTarget,
                      composerMaxLines,
                    );
                  }}
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
                  className="min-h-5 min-w-0 flex-1 resize-none overflow-y-auto bg-transparent py-1 text-[16px] leading-5 outline-none placeholder:text-muted-foreground sm:text-[14px]"
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
              "composer-shell bg-transparent px-2.5 py-1.5 dark:bg-input",
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
            {showLibrary ? (
              <div className="mb-1 flex min-w-0 items-center gap-1">
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
              </div>
            ) : null}
            <div className={cn("relative", dictatingActive && "h-8 overflow-hidden")}>
              {dictatingActive ? (
                <div className="absolute inset-0 z-10 flex items-center">
                  <ComposerRecordingView
                    status={transcribing ? "transcribing" : "recording"}
                    meter={dictationMeter}
                    liveText={liveSpeechMode ? value : null}
                    onCancel={cancelDictation}
                    onStop={() => stopDictationAndTranscribe("insert")}
                    onSend={() => stopDictationAndTranscribe("send")}
                  />
                </div>
              ) : null}
            <div
              className={cn(
                "flex min-h-8 items-end gap-1",
                dictatingActive && "opacity-0",
              )}
              aria-hidden={dictatingActive || undefined}
            >
              <ToolBtn
                label="Add"
                active={menu === "plus"}
                emphasize
                onClick={() => toggleMenu("plus")}
              >
                <Plus className="h-5 w-5 text-muted-foreground" strokeWidth={2.25} />
              </ToolBtn>
              {!hasInlineAtoms ? (
                <textarea
                  ref={(el) => {
                    textRef.current = el;
                    if (el) {
                      const key =
                        blocks.find((b) => b.type === "text")?.key ?? "main";
                      textInputRefs.current.set(key, el as unknown as HTMLSpanElement);
                      if (!dictatingActive) {
                        syncComposerFieldHeight(el, composerMaxLines);
                      }
                    }
                  }}
                  value={value}
                  rows={1}
                  placeholder={hint}
                  autoFocus={raiseKeyboard}
                  enterKeyHint="send"
                  autoComplete="off"
                  readOnly={dictatingActive}
                  onFocus={() => {
                    const key =
                      blocks.find((b) => b.type === "text")?.key ?? null;
                    focusedTextKeyRef.current = key;
                    suppressAutoFocusRef.current = false;
                    onFocus?.();
                  }}
                  onChange={(event) => {
                    if (dictatingActive) return;
                    const next = event.target.value;
                    textCursorRef.current =
                      event.target.selectionStart ?? next.length;
                    if (dictateError) setDictateError(null);
                    setBlocks(blocksFromText(next));
                    syncComposerFieldHeight(
                      event.currentTarget,
                      composerMaxLines,
                    );
                    if (landing || stayInPlace) return;
                    if (projectId) return;
                    if (next.trim() && isChatSpace(spaceId)) {
                      armChatInterface(spaceId);
                    } else if (!next.trim() && !thread) {
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
                  className="box-border min-h-8 min-w-0 flex-1 resize-none overflow-y-auto bg-transparent py-[6px] text-[16px] leading-5 outline-none placeholder:text-muted-foreground sm:text-[14px]"
                  style={{ maxHeight: `${composerMaxLines * 1.25}rem` }}
                />
              ) : (
                <ComposerEditableSurface
                  blocks={blocks}
                  placeholder={hint}
                  autoFocus={raiseKeyboard}
                  style={{ maxHeight: `${composerMaxLines * 1.25}rem` }}
                  className="min-h-8 overflow-y-auto py-[6px] text-[16px] leading-5 sm:text-[14px]"
                  // Stay focusable under the dictation overlay so the keyboard stays up.
                  renderConnector={(block) => {
                    const iconId =
                      connectors.find((c) => c.id === block.scope.connectorId)
                        ?.icon ?? block.scope.connectorId;
                    return (
                      <span
                        className={cn(
                          "group/conn relative mx-[0.12em] inline whitespace-nowrap align-baseline",
                          "text-sky-500/95 dark:text-sky-400/95",
                        )}
                      >
                        <ConnectorMark
                          id={iconId}
                          size="nav"
                          className="!mr-[0.2em] !inline-block !h-[0.75em] !w-[0.75em] !align-[-0.05em]"
                        />
                        {block.scope.label}
                        <button
                          type="button"
                          data-remove-connection={block.scope.connectionId}
                          aria-label={`Remove ${block.scope.label}`}
                          className="pointer-events-none absolute -right-1.5 -top-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-muted text-muted-foreground opacity-0 shadow-sm ring-1 ring-border transition-opacity duration-150 group-hover/conn:pointer-events-auto group-hover/conn:opacity-100"
                        >
                          <X className="h-2.5 w-2.5" strokeWidth={2.25} />
                        </button>
                      </span>
                    );
                  }}
                  renderTrigger={(block) => {
                    const open = triggerPicker?.triggerKey === block.key;
                    return (
                      <span
                        className={cn(
                          "inline whitespace-nowrap rounded-sm align-baseline text-sky-600/90 underline decoration-sky-500/50 decoration-dotted underline-offset-[3px] dark:text-sky-400/90",
                          open && "bg-sky-500/10 text-sky-500",
                        )}
                      >
                        {block.matched}
                      </span>
                    );
                  }}
                  onFocus={() => {
                    suppressAutoFocusRef.current = false;
                    onFocus?.();
                  }}
                  onCursorChange={(cursor) => {
                    textCursorRef.current = cursor;
                  }}
                  onRemoveConnector={(connectionId) => {
                    const scope = connectorScopes.find(
                      (c) => c.connectionId === connectionId,
                    );
                    if (scope) dismissConnectorChip(scope);
                  }}
                  onTriggerClick={(triggerKey, anchor) => {
                    const trigger = blocks.find(
                      (b): b is ComposerTriggerBlock =>
                        b.type === "trigger" && b.key === triggerKey,
                    );
                    if (trigger) onTriggerWordClick(trigger, anchor);
                  }}
                  onBlocksChange={(next, cursor) => {
                    if (dictatingActive) return;
                    textCursorRef.current = cursor;
                    if (dictateError) setDictateError(null);
                    setBlocks(next);
                    const plain = textFromBlocks(next);
                    if (landing || stayInPlace) return;
                    if (projectId) return;
                    if (plain.trim() && isChatSpace(spaceId)) {
                      armChatInterface(spaceId);
                    } else if (
                      !plain.trim() &&
                      !thread &&
                      connectorsFromBlocks(next).length === 0
                    ) {
                      collapseDraft();
                    }
                  }}
                  onKeyDown={(event) => {
                    if (dictatingActive) {
                      event.preventDefault();
                      return;
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
                    if (event.key === "Backspace") {
                      const root = event.currentTarget;
                      const caret = caretPlainOffset(root);
                      textCursorRef.current = caret;
                      // Map caret to text key at offset 0 of a segment after a chip.
                      let offset = 0;
                      for (let i = 0; i < blocks.length; i += 1) {
                        const block = blocks[i]!;
                        if (block.type === "text") {
                          if (
                            caret === offset &&
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
                            }
                            return;
                          }
                          offset += block.value.length;
                        } else if (block.type === "connector") {
                          offset += block.scope.label.length;
                        } else {
                          offset += block.matched.length;
                        }
                      }
                    }
                  }}
                />
              )}
              <div className="flex shrink-0 items-end gap-0.5 self-end">
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
      data-composer-keep-keyboard=""
      onPointerDown={(event) => {
        // Don't steal focus from the composer field.
        event.preventDefault();
      }}
      className={cn(
        "absolute z-50 flex flex-col gap-1 overflow-y-auto overscroll-contain px-1.5 py-2 shadow-[0_12px_40px_rgba(0,0,0,0.28)]",
        openAbove
          ? "inset-x-0 bottom-[calc(100%+8px)]"
          : "inset-x-0 top-[calc(100%+8px)]",
        mobile
          ? "max-h-[min(28rem,60vh)] rounded-[18px] border border-white/10 bg-popover/92 backdrop-blur-xl dark:bg-zinc-900/90"
          : "max-h-[min(30rem,62vh)] light-surface shell-g3-radius bg-popover dark:bg-zinc-900",
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
            ? "gap-[0.425rem] rounded-[10px] px-3 py-[3.6px]"
            : "gap-[0.53125rem] rounded-[12px] px-3 py-[4.5px]",
          selected && "bg-foreground/[0.08] dark:bg-white/10",
        )}
    >
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center overflow-hidden text-foreground/80",
          compact ? "h-[11.4px] w-[11.4px] text-[11.9px]" : "h-[12.35px] w-[12.35px] text-[12.8px]",
        )}
      >
        {icon}
      </span>
      <span
        className={cn(
          "flex min-w-0 flex-1 items-baseline truncate tracking-[-0.01em] font-normal",
          compact ? "gap-[1ch] text-[12.5px]" : "gap-[1ch] text-[13.5px]",
        )}
      >
        <span className="text-foreground/80">{label}</span>
        {description ? (
          <span className="text-muted-foreground/65">{description}</span>
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
          ? "text-muted-foreground hover:bg-foreground/5 hover:text-foreground dark:text-muted-foreground dark:hover:bg-white/5 dark:hover:text-foreground"
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
