"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useApp } from "@/components/app/AppProvider";
import { useSpaceApi, useWorkspaceCtx } from "@/components/app/SpaceDataProvider";
import { upsertChatThread, getChatStoreSnapshot } from "@/lib/api/chat-store";
import { mergeHydratedThread } from "@/lib/api/chat-sync";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { ClarificationCardSlot } from "@/components/chat/ClarificationCard";
import { ChatMessage } from "@/components/chat/MessageBlocks";
import { Composer } from "@/components/shell/Composer";
import { APP_TAGLINE } from "@/lib/app-brand";
import { chatSpaceCopy } from "@/lib/space-icons";
import type {
  ChatFileAttachment,
  ChatImageAttachment,
  ChatSendAttachment,
  Message,
  SpaceId,
} from "@/lib/types";
import { chatSpaceId } from "@/lib/spaces";
import { cn } from "@/lib/utils";
import { useChatCanvasCentered } from "@/lib/chat-layout";
import { useMobileShell } from "@/lib/use-media-query";
import { dismissNativeKeyboard } from "@/lib/mobile-shell";
import { useShellStyle } from "@/lib/shell-chrome";
import { MOBILE_APP_BG } from "@/lib/mobile-menu-styles";

/** Gap between the last bubble and the composer when scrolled to the end. */
const TRANSCRIPT_BOTTOM_GAP_PX = 30;

/** Offset of `el` within a scroll container's content coordinates. */
function offsetWithinScrollParent(el: HTMLElement, parent: HTMLElement) {
  const parentRect = parent.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  return elRect.top - parentRect.top + parent.scrollTop;
}

/** Wait until the soft keyboard is fully down, then run (ChatGPT send→pin timing). */
function afterKeyboardCollapsed(run: () => void) {
  if (typeof window === "undefined") {
    run();
    return () => undefined;
  }
  const open = document.documentElement.dataset.keyboard === "1";
  if (!open) {
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(run);
    });
    return () => window.cancelAnimationFrame(id);
  }
  let done = false;
  let fallback = 0;
  let settle = 0;
  const finish = () => {
    if (done) return;
    done = true;
    window.removeEventListener("keyboardDidHide", finish);
    window.removeEventListener("keyboardWillHide", finish);
    if (fallback) window.clearTimeout(fallback);
    settle = window.setTimeout(run, 48);
  };
  window.addEventListener("keyboardDidHide", finish);
  window.addEventListener("keyboardWillHide", finish);
  fallback = window.setTimeout(finish, 480);
  return () => {
    done = true;
    window.removeEventListener("keyboardDidHide", finish);
    window.removeEventListener("keyboardWillHide", finish);
    if (fallback) window.clearTimeout(fallback);
    if (settle) window.clearTimeout(settle);
  };
}

function ComposerDock({
  onSend,
  hideSpaceTools,
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
  hideSpaceTools?: boolean;
  autoFocus?: boolean;
}) {
  const { thread, continueAfterClarification, workspaceId } = useApp();
  const mobile = useMobileShell();
  const floating = useShellStyle() === "floating";
  const { centered, chatMaxWidthClass } = useChatCanvasCentered();

  return (
    <div
      className={cn(
        "composer-keyboard-pad shrink-0",
        floating && !mobile
          ? centered
            ? "px-4 sm:px-6"
            : "pr-2.5 pl-1.5 sm:pr-3 sm:pl-2"
          : "px-4 sm:px-6",
        "pb-[max(0.75rem,calc(env(safe-area-inset-bottom)+0.7rem))] sm:pb-4",
      )}
    >
      <div
        className={cn(
          "w-full",
          chatMaxWidthClass,
          (!floating || centered || mobile) && "mx-auto",
        )}
      >
        <ClarificationCardSlot
          threadId={thread?.id}
          workspaceId={workspaceId}
          onSubmitted={continueAfterClarification}
        />
        <Composer
          onSend={onSend}
          hideSpaceTools={hideSpaceTools}
          inDock
          autoFocus={autoFocus}
        />
      </div>
    </div>
  );
}

export function ChatColumn() {
  const {
    thread,
    spaceId,
    sendMessage,
    drafting,
    view,
    projectId,
    overlay,
    mobileSurface,
    connectorId,
    resumeConnectorChat,
  } =
    useApp();
  const api = useSpaceApi();
  const ctx = useWorkspaceCtx();
  const browserMode = view === "browser";
  const mobile = useMobileShell();
  const hasChatTurns = Boolean(
    thread?.messages.some(
      (item) => item.role === "user" || item.role === "assistant",
    ),
  );
  const hasChatTurnsRef = useRef(hasChatTurns);
  hasChatTurnsRef.current = hasChatTurns;
  // Empty new chat → autofocus composer on mobile. Reading an existing
  // thread or any overlay/browser surface must not steal focus.
  // Keep this stable across menu/panel swipes — Composer only focuses while
  // chat owns the screen, so gating here was breaking panel→chat reopen.
  const autofocusComposer = !browserMode && !hasChatTurns && !overlay;
  const showSpaceNewPrompt =
    drafting && Boolean(spaceId) && !hasChatTurns && !browserMode;
  const showLanding =
    !browserMode && !hasChatTurns && (!thread || drafting) && !showSpaceNewPrompt;

  // Keep the one-chat-per-connector thread selected whenever chat is shown
  // beside a connector (covers panel remounts and Chat|Panel toggles).
  useEffect(() => {
    if (!connectorId) return;
    resumeConnectorChat();
  }, [connectorId, resumeConnectorChat]);
  const endRef = useRef<HTMLDivElement>(null);
  const latestUserRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const prevThreadId = useRef<string | null>(null);
  const prevProjectId = useRef<string | null | undefined>(undefined);
  const prevSpaceId = useRef<string | null | undefined>(undefined);
  const userPinnedScroll = useRef(false);
  const scrollParentRef = useRef<HTMLDivElement | null>(null);
  const scrollUnsubRef = useRef<(() => void) | null>(null);
  const pinCleanupRef = useRef<(() => void) | null>(null);
  const lastPinnedUserIdRef = useRef<string | null>(null);
  /** Keep pin-room spacer until the current assistant turn finishes. */
  const pinningTurnRef = useRef(false);
  const [spacerPx, setSpacerPx] = useState(TRANSCRIPT_BOTTOM_GAP_PX);
  const last = thread?.messages.at(-1);
  const lastUserId = [...(thread?.messages ?? [])]
    .reverse()
    .find((m) => m.role === "user")?.id;
  const floating = useShellStyle() === "floating";
  const { centered, chatMaxWidthClass } = useChatCanvasCentered();
  const assistantBusy =
    last?.role === "assistant" &&
    (last.status === "streaming" || last.status === "pending");
  const assistantTurnSettled =
    last?.role === "assistant" &&
    last.status !== "streaming" &&
    last.status !== "pending";

  const measurePinSpacer = () => {
    const parent = scrollParentRef.current;
    const userEl = latestUserRef.current;
    const endEl = endRef.current;
    if (!parent || !userEl || !endEl) return TRANSCRIPT_BOTTOM_GAP_PX;
    const scrollMargin =
      Number.parseFloat(getComputedStyle(userEl).scrollMarginTop) ||
      (mobile
        ? Number.parseFloat(getComputedStyle(parent).paddingTop) || 70
        : 16);
    const fromUserToEnd = Math.max(
      0,
      offsetWithinScrollParent(endEl, parent) -
        offsetWithinScrollParent(userEl, parent),
    );
    const pinRoom = parent.clientHeight - scrollMargin - fromUserToEnd;
    return Math.max(TRANSCRIPT_BOTTOM_GAP_PX, Math.ceil(pinRoom));
  };

  const updateTranscriptSpacer = (opts?: { forcePinRoom?: boolean }) => {
    const wantPinRoom =
      opts?.forcePinRoom || pinningTurnRef.current || assistantBusy;
    const next = wantPinRoom ? measurePinSpacer() : TRANSCRIPT_BOTTOM_GAP_PX;
    setSpacerPx((prev) => (prev === next ? prev : next));
    return next;
  };

  const pinLatestUserToTop = (behavior: ScrollBehavior = "smooth") => {
    const el = latestUserRef.current;
    const parent = scrollParentRef.current;
    if (!el) return;
    // Lock follow-streaming so the reply grows downward under the pinned turn.
    userPinnedScroll.current = true;
    pinningTurnRef.current = true;
    updateTranscriptSpacer({ forcePinRoom: true });
    // Mobile: scrollIntoView ignores the scroll container's padding-top and
    // parks the bubble under the transparent chrome. Scroll manually so the
    // message settles just below the header with a smooth upward slide.
    if (parent && mobile) {
      const padTop = Number.parseFloat(getComputedStyle(parent).paddingTop) || 0;
      const gap = 8;
      const top = Math.max(
        0,
        offsetWithinScrollParent(el, parent) - padTop - gap,
      );
      parent.scrollTo({ top, behavior });
      return;
    }
    el.scrollIntoView({ block: "start", behavior });
  };

  const snapTranscriptToBottom = (behavior: ScrollBehavior = "auto") => {
    const parent = scrollParentRef.current;
    if (parent) {
      if (behavior === "smooth") {
        parent.scrollTo({ top: parent.scrollHeight, behavior: "smooth" });
      } else {
        parent.scrollTop = parent.scrollHeight;
      }
      return;
    }
    endRef.current?.scrollIntoView({ block: "end", behavior });
  };

  const bindScrollParent = (node: HTMLDivElement | null) => {
    scrollUnsubRef.current?.();
    scrollUnsubRef.current = null;
    scrollParentRef.current = node;
    if (!node) return;
    let touchStartY = 0;
    let dismissedThisGesture = false;
    const onScroll = () => {
      const distanceFromBottom =
        node.scrollHeight - node.scrollTop - node.clientHeight;
      userPinnedScroll.current = distanceFromBottom > 80;
    };
    // Dismiss keyboard only when the finger moves down. Swiping up through
    // older turns (or bouncing at the bottom) must keep the keyboard open.
    const onTouchStart = (event: TouchEvent) => {
      touchStartY = event.touches[0]?.clientY ?? 0;
      dismissedThisGesture = false;
    };
    const onTouchMove = (event: TouchEvent) => {
      if (!mobile || !hasChatTurnsRef.current || dismissedThisGesture) return;
      const y = event.touches[0]?.clientY ?? touchStartY;
      if (y - touchStartY > 36) {
        dismissedThisGesture = true;
        dismissNativeKeyboard({ suppressComposer: true });
      }
    };
    node.addEventListener("scroll", onScroll, { passive: true });
    node.addEventListener("touchstart", onTouchStart, { passive: true });
    node.addEventListener("touchmove", onTouchMove, { passive: true });
    scrollUnsubRef.current = () => {
      node.removeEventListener("scroll", onScroll);
      node.removeEventListener("touchstart", onTouchStart);
      node.removeEventListener("touchmove", onTouchMove);
    };
  };

  useEffect(() => () => {
    scrollUnsubRef.current?.();
    pinCleanupRef.current?.();
  }, []);

  // Size the bottom spacer from content: pin-room while a turn is active,
  // otherwise only a small gap above the composer (no endless white scroll).
  useLayoutEffect(() => {
    if (!hasChatTurns) {
      setSpacerPx(TRANSCRIPT_BOTTOM_GAP_PX);
      return;
    }

    const wasPinning = pinningTurnRef.current;
    // Keep pin-room after send until the assistant finishes — not merely while
    // status is pending/streaming (there is a beat with only the user bubble).
    if (assistantTurnSettled && pinningTurnRef.current) {
      pinningTurnRef.current = false;
    }

    updateTranscriptSpacer();

    // Short finished turns: collapse pin-room and rest above the composer.
    if (wasPinning && !pinningTurnRef.current && assistantTurnSettled) {
      const parent = scrollParentRef.current;
      const userEl = latestUserRef.current;
      const endEl = endRef.current;
      if (parent && userEl && endEl) {
        const fromUserToEnd =
          offsetWithinScrollParent(endEl, parent) -
          offsetWithinScrollParent(userEl, parent);
        if (fromUserToEnd + TRANSCRIPT_BOTTOM_GAP_PX <= parent.clientHeight) {
          snapTranscriptToBottom("auto");
        }
      }
    }

    const parent = scrollParentRef.current;
    if (!parent || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      updateTranscriptSpacer();
    });
    ro.observe(parent);
    if (latestUserRef.current) ro.observe(latestUserRef.current);
    if (endRef.current) ro.observe(endRef.current);
    return () => ro.disconnect();
  }, [
    hasChatTurns,
    assistantBusy,
    assistantTurnSettled,
    last?.content,
    last?.id,
    lastUserId,
    mobile,
    thread?.messages?.length,
  ]);

  // Bulk listThreads omits heavy image blocks; hydrate the open thread on demand.
  useEffect(() => {
    const threadId = thread?.id;
    if (!threadId || !isSupabaseConfigured()) return;
    let cancelled = false;
    void api.chat.getThread(ctx, threadId).then((remote) => {
      if (cancelled || !remote) return;
      const local = getChatStoreSnapshot().threads.find((t) => t.id === threadId);
      upsertChatThread(mergeHydratedThread(local, remote));
    });
    return () => {
      cancelled = true;
    };
  }, [api.chat, ctx, thread?.id]);

  useLayoutEffect(() => {
    const threadId = thread?.id ?? null;
    const threadSwitched = prevThreadId.current !== threadId;
    const projectChanged = prevProjectId.current !== projectId;
    const spaceChanged = prevSpaceId.current !== spaceId;
    const navigated =
      threadSwitched ||
      projectChanged ||
      spaceChanged ||
      prevProjectId.current === undefined ||
      prevSpaceId.current === undefined;
    prevThreadId.current = threadId;
    prevProjectId.current = projectId;
    prevSpaceId.current = spaceId;

    if (!hasChatTurns) {
      if (navigated) {
        userPinnedScroll.current = false;
        pinningTurnRef.current = false;
        lastPinnedUserIdRef.current = null;
        pinCleanupRef.current?.();
        pinCleanupRef.current = null;
        setSpacerPx(TRANSCRIPT_BOTTOM_GAP_PX);
      }
      return;
    }

    const needsPin =
      Boolean(lastUserId) && lastUserId !== lastPinnedUserIdRef.current;
    // First send often creates/switches thread.id in the same tick as the user
    // bubble — treat that as a pin, not a history browse (which snaps to bottom).
    const activeTurn =
      last?.role === "user" ||
      (last?.role === "assistant" &&
        (last.status === "pending" || last.status === "streaming"));

    if (navigated && !(needsPin && activeTurn)) {
      userPinnedScroll.current = false;
      pinningTurnRef.current = false;
      lastPinnedUserIdRef.current = lastUserId ?? null;
      pinCleanupRef.current?.();
      pinCleanupRef.current = null;
      setSpacerPx(TRANSCRIPT_BOTTOM_GAP_PX);
      snapTranscriptToBottom("auto");
      const parent = scrollParentRef.current;
      const t1 = window.requestAnimationFrame(() => snapTranscriptToBottom("auto"));
      const t2 = window.setTimeout(() => snapTranscriptToBottom("auto"), 120);
      const t3 = window.setTimeout(() => snapTranscriptToBottom("auto"), 560);
      return () => {
        window.cancelAnimationFrame(t1);
        window.clearTimeout(t2);
        window.clearTimeout(t3);
        void parent;
      };
    }

    // New user turn (same thread OR send that opened a new thread): pin under header.
    if (!needsPin || !lastUserId) return;
    lastPinnedUserIdRef.current = lastUserId;
    pinningTurnRef.current = true;
    pinCleanupRef.current?.();
    updateTranscriptSpacer({ forcePinRoom: true });

    if (mobile) {
      dismissNativeKeyboard({ suppressComposer: true });
      pinCleanupRef.current = afterKeyboardCollapsed(() => {
        updateTranscriptSpacer({ forcePinRoom: true });
        pinLatestUserToTop("smooth");
        // Second pass after layout/spacer settles.
        window.setTimeout(() => pinLatestUserToTop("smooth"), 120);
      });
      return () => {
        pinCleanupRef.current?.();
        pinCleanupRef.current = null;
      };
    }

    pinLatestUserToTop("smooth");
    const t = window.setTimeout(() => pinLatestUserToTop("smooth"), 80);
    return () => window.clearTimeout(t);
  }, [
    lastUserId,
    last?.id,
    last?.role,
    last?.status,
    thread?.id,
    mobile,
    hasChatTurns,
    projectId,
    spaceId,
  ]);

  useEffect(() => {
    // While the assistant is typing, follow the reply only if the user hasn't
    // scrolled away — never trap the viewport during a response.
    if (userPinnedScroll.current) return;
    if (last?.role === "assistant" && last.status === "streaming") {
      endRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [last?.content, last?.role, last?.status]);

  const send = (
    text: string,
    opts?: {
      attachments?: ChatImageAttachment[];
      files?: ChatFileAttachment[];
      sendAttachments?: ChatSendAttachment[];
    },
  ) => {
    const trimmed = text.trim();
    const hasAttachments =
      Boolean(opts?.attachments?.length) ||
      Boolean(opts?.files?.length) ||
      Boolean(opts?.sendAttachments?.length);
    if (!trimmed && !hasAttachments) {
      return;
    }
    const go = () => sendMessage(trimmed, opts);
    if (
      showLanding &&
      !browserMode &&
      !mobile &&
      typeof document.startViewTransition === "function"
    ) {
      document.startViewTransition(() => {
        flushSync(go);
      });
      return;
    }
    go();
  };

  const renderTranscript = (messages: Message[]) => (
    <>
      {messages.map((message) => {
        const pin = message.id === lastUserId && message.role === "user";
        return (
          <div
            key={message.id}
            ref={pin ? latestUserRef : undefined}
            className={
              pin
                ? mobile
                  ? // Match chat-scroll top pad so the bubble settles under the transparent header.
                    "scroll-mt-[calc(env(safe-area-inset-top,0px)+4.5rem)]"
                  : "scroll-mt-4"
                : undefined
            }
          >
            <ChatMessage message={message} />
          </div>
        );
      })}
      {/* End of real content — streaming follow / bottom snap land here. */}
      <div ref={endRef} />
      {/* Dynamic pin-room while a turn is active; otherwise ~30px above composer. */}
      <div
        ref={spacerRef}
        className="shrink-0"
        style={{ height: spacerPx }}
        aria-hidden
      />
    </>
  );

  if (browserMode) {
    return (
      <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
        <div
          ref={bindScrollParent}
          className="chat-scroll flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {thread ? (
            <div className={cn("mx-auto flex w-full flex-col gap-5", chatMaxWidthClass)}>
              {renderTranscript(thread.messages)}
            </div>
          ) : (
            <div ref={endRef} />
          )}
        </div>
        <ComposerDock onSend={send} hideSpaceTools autoFocus={autofocusComposer} />
      </section>
    );
  }

  // Mobile ChatGPT-style: empty prompt + composer pinned to bottom.
  if (mobile) {
    return (
      <section
        data-mobile-chat=""
        className={cn(
          "relative box-border flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
          MOBILE_APP_BG,
        )}
      >
        <div
          ref={bindScrollParent}
          className="chat-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-[calc(env(safe-area-inset-top,0px)+4.375rem)] pb-4 touch-pan-y [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {hasChatTurns || thread ? (
            <div className="mx-auto flex w-full max-w-none flex-col gap-5">
              {thread ? renderTranscript(thread.messages) : null}
            </div>
          ) : (
            <div ref={endRef} />
          )}
        </div>
        <div className={cn("sticky bottom-0 z-20 shrink-0", MOBILE_APP_BG)}>
          <ComposerDock onSend={send} autoFocus={autofocusComposer} />
        </div>
      </section>
    );
  }

  return (
    <section
      className={cn(
        "@container relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background",
      )}
    >
      {showLanding ? (
        <EmptyChat spaceId={chatSpaceId(spaceId)} drafting={drafting} onPrompt={send} autoFocusComposer={autofocusComposer} />
      ) : (
        <div
          ref={bindScrollParent}
          className={cn(
            "chat-scroll flex-1 overflow-y-auto pt-4 pb-5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
            floating
              ? centered
                ? "px-4 sm:px-6"
                : "pl-1.5 pr-2.5 sm:pl-2 sm:pr-3"
              : "px-4 sm:px-6",
          )}
        >
          <div
            className={cn(
              "flex w-full flex-col gap-5",
              chatMaxWidthClass,
              (!floating || centered) && "mx-auto",
            )}
          >
            {thread ? renderTranscript(thread.messages) : null}
          </div>
        </div>
      )}

      {showLanding ? null : (
        <ComposerDock onSend={send} autoFocus={autofocusComposer} />
      )}
    </section>
  );
}

function emptyCopy(spaceId: SpaceId | null) {
  if (spaceId && spaceId in chatSpaceCopy) {
    return chatSpaceCopy[spaceId as keyof typeof chatSpaceCopy];
  }
  return null;
}

function EmptyChat({
  spaceId,
  drafting,
  onPrompt,
  autoFocusComposer = false,
}: {
  spaceId: SpaceId | null;
  drafting: boolean;
  onPrompt: (
    text: string,
    opts?: {
      attachments?: ChatImageAttachment[];
      files?: ChatFileAttachment[];
      sendAttachments?: ChatSendAttachment[];
    },
  ) => void;
  autoFocusComposer?: boolean;
}) {
  const copy = drafting ? emptyCopy(spaceId) : null;
  const shellRef = useRef<HTMLDivElement>(null);
  const clusterRef = useRef<HTMLDivElement>(null);
  const baseHeightRef = useRef(0);
  const [padTop, setPadTop] = useState(0);

  useLayoutEffect(() => {
    baseHeightRef.current = 0;
    const shell = shellRef.current;
    const cluster = clusterRef.current;
    if (!shell || !cluster) return;

    const place = () => {
      if (window.matchMedia("(max-width: 767px)").matches) {
        setPadTop(0);
        return;
      }
      if (!baseHeightRef.current) {
        baseHeightRef.current = cluster.offsetHeight;
      }
      const styles = window.getComputedStyle(shell);
      const padY =
        (Number.parseFloat(styles.paddingTop) || 0) +
        (Number.parseFloat(styles.paddingBottom) || 0);
      const available = shell.clientHeight - padY;
      const next = Math.max(
        0,
        Math.round((available - baseHeightRef.current) / 2),
      );
      setPadTop(next);
    };

    place();
    const ro = new ResizeObserver(place);
    ro.observe(shell);
    window.addEventListener("resize", place);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [copy?.headline, spaceId]);

  return (
    <div
      ref={shellRef}
      className={cn(
        "relative flex flex-1 flex-col items-center justify-center px-8 py-10 md:justify-start",
      )}
    >
      <div
        ref={clusterRef}
        className="flex w-full max-w-[44rem] flex-col items-center max-md:!mt-0"
        style={{ marginTop: padTop }}
      >
        {copy ? (
          <>
            <h1 className="landing-headline heading-display text-center text-[1.85rem] md:text-[2.15rem]">
              {copy.headline}
            </h1>
            <p className="mt-2 max-w-md text-center text-[15px] leading-relaxed text-muted-foreground">
              {copy.detail}
            </p>
          </>
        ) : (
          <h1 className="landing-headline heading-display text-center text-[1.85rem] md:text-[2.15rem]">
            {APP_TAGLINE}
          </h1>
        )}
        <div className="mt-[17px] w-full">
          <Composer onSend={onPrompt} landing autoFocus={autoFocusComposer} />
        </div>
      </div>
    </div>
  );
}
