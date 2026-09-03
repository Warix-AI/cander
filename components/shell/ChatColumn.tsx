"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useApp } from "@/components/app/AppProvider";
import { useSpaceApi, useWorkspaceCtx } from "@/components/app/SpaceDataProvider";
import { upsertChatThread, getChatStoreSnapshot } from "@/lib/api/chat-store";
import { mergeHydratedThread } from "@/lib/api/chat-sync";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { CanderMark } from "@/components/brand/CanderMark";
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
import { useShellStyle } from "@/lib/shell-chrome";
import { MOBILE_APP_BG } from "@/lib/mobile-menu-styles";

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
  const { thread, continueAfterClarification } = useApp();
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
  const { thread, spaceId, sendMessage, drafting, view, projectId, overlay } =
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
  // Empty new chat → autofocus composer (Capacitor). Reading an existing
  // thread or any overlay/browser surface must not steal focus.
  const autofocusComposer = !browserMode && !hasChatTurns && !overlay;
  const showSpaceNewPrompt =
    drafting && Boolean(spaceId) && !hasChatTurns && !browserMode;
  const showLanding =
    !browserMode && !hasChatTurns && (!thread || drafting) && !showSpaceNewPrompt;
  const endRef = useRef<HTMLDivElement>(null);
  const latestUserRef = useRef<HTMLDivElement>(null);
  const prevThreadId = useRef<string | null>(null);
  const prevProjectId = useRef<string | null | undefined>(undefined);
  const prevSpaceId = useRef<string | null | undefined>(undefined);
  const userPinnedScroll = useRef(false);
  const scrollParentRef = useRef<HTMLDivElement | null>(null);
  const scrollUnsubRef = useRef<(() => void) | null>(null);
  const last = thread?.messages.at(-1);
  const lastUserId = [...(thread?.messages ?? [])]
    .reverse()
    .find((m) => m.role === "user")?.id;
  const floating = useShellStyle() === "floating";
  const { centered, chatMaxWidthClass } = useChatCanvasCentered();

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
    const onScroll = () => {
      const distanceFromBottom =
        node.scrollHeight - node.scrollTop - node.clientHeight;
      userPinnedScroll.current = distanceFromBottom > 80;
    };
    node.addEventListener("scroll", onScroll, { passive: true });
    scrollUnsubRef.current = () =>
      node.removeEventListener("scroll", onScroll);
  };

  useEffect(() => () => scrollUnsubRef.current?.(), []);

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

    if (navigated) {
      userPinnedScroll.current = false;
    }

    if (!hasChatTurns) return;

    // Returning from a project / switching spaces: land at the bottom with the
    // spacer gap so the transcript is ready for the next prompt — not mid-page.
    if (navigated) {
      snapTranscriptToBottom("auto");
      const parent = scrollParentRef.current;
      // Width/visibility animations can leave scroll mid-transcript; re-snap.
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

    // Same-thread new turn: pin the latest user message near the top.
    if (mobile) {
      const el = latestUserRef.current ?? endRef.current;
      if (!el) return;
      el.scrollIntoView({ block: "start", behavior: "auto" });
      return;
    }

    if (!lastUserId) return;
    const el = latestUserRef.current;
    if (!el) return;
    el.scrollIntoView({
      block: "start",
      behavior: "smooth",
    });
  }, [lastUserId, last?.id, thread?.id, mobile, hasChatTurns, projectId, spaceId]);

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
                ? "scroll-mt-[-25px] md:scroll-mt-[-100px]"
                : undefined
            }
          >
            <ChatMessage message={message} />
          </div>
        );
      })}
      {/* Room below the latest turn so it can sit near the top like ChatGPT. */}
      <div className="min-h-[30dvh]" aria-hidden />
      <div ref={endRef} />
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
          className="chat-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-4 touch-pan-y [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
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
        <CanderMark className="landing-mark mb-4 !h-[35.64px] !w-[37.2px] -translate-y-[2px]" />
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
        <div className="mt-8 w-full">
          <Composer onSend={onPrompt} landing autoFocus={autoFocusComposer} />
        </div>
      </div>
    </div>
  );
}
