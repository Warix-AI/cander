"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useApp } from "@/components/app/AppProvider";
import { CourierMark } from "@/components/brand/CourierMark";
import { ChatMessage } from "@/components/chat/MessageBlocks";
import { SessionSummaryBubble } from "@/components/chat/SessionSummaryBubble";
import { Composer } from "@/components/shell/Composer";
import { chatSpaceCopy } from "@/lib/space-icons";
import type { SpaceId } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useChatCanvasCentered } from "@/lib/chat-layout";
import { useMobileShell } from "@/lib/use-media-query";
import { useShellStyle } from "@/lib/shell-chrome";

export function ChatColumn() {
  const { thread, spaceId, sendMessage, drafting, view } = useApp();
  const browserMode = view === "browser";
  const mobile = useMobileShell();
  const showLanding = !browserMode && !thread && !drafting;
  const endRef = useRef<HTMLDivElement>(null);
  const last = thread?.messages.at(-1);
  const floating = useShellStyle() === "floating";
  const { centered } = useChatCanvasCentered();

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [last?.id, last?.content, last?.blocks]);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const go = () => sendMessage(trimmed);
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

  if (browserMode) {
    return (
      <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
          {thread ? (
            <div className="mx-auto flex w-full max-w-[38rem] flex-col gap-6">
              {thread.messages.map((message) => (
                <ChatMessage key={message.id} message={message} />
              ))}
              <div ref={endRef} />
            </div>
          ) : (
            <div ref={endRef} />
          )}
        </div>
        <Composer onSend={send} hideSpaceTools />
      </section>
    );
  }

  // Mobile ChatGPT-style: empty canvas + composer always pinned to bottom.
  if (mobile) {
    return (
      <section
        data-mobile-chat=""
        className="relative box-border flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background"
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 touch-pan-y">
          {showLanding ? (
            <div className="flex min-h-full flex-col justify-end pb-3" />
          ) : (
            <div className="mx-auto flex w-full max-w-[38rem] flex-col gap-6">
              {thread?.sessionSummary ? (
                <SessionSummaryBubble
                  threadId={thread.id}
                  summary={thread.sessionSummary}
                />
              ) : null}
              {thread
                ? thread.messages.map((message) => (
                    <ChatMessage key={message.id} message={message} />
                  ))
                : null}
              <div ref={endRef} />
            </div>
          )}
        </div>
        <div className="shrink-0">
          <Composer onSend={send} />
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
        <EmptyChat spaceId={spaceId} onPrompt={send} />
      ) : (
        <div
          className={cn(
            "flex-1 overflow-y-auto py-5",
            floating
              ? centered
                ? "px-4 sm:px-6"
                : "pl-1.5 pr-2.5 sm:pl-2 sm:pr-3"
              : "px-4 sm:px-6",
          )}
        >
          <div
            className={cn(
              "flex w-full max-w-[38rem] flex-col gap-6",
              (!floating || centered) && "mx-auto",
            )}
          >
            {thread?.sessionSummary ? (
              <SessionSummaryBubble
                threadId={thread.id}
                summary={thread.sessionSummary}
              />
            ) : null}
            {thread
              ? thread.messages.map((message) => (
                  <ChatMessage key={message.id} message={message} />
                ))
              : null}
            <div ref={endRef} />
          </div>
        </div>
      )}

      {showLanding ? null : <Composer onSend={send} />}
    </section>
  );
}

function EmptyChat({
  spaceId,
  onPrompt,
}: {
  spaceId: SpaceId | null;
  onPrompt: (text: string) => void;
}) {
  const heading =
    spaceId && spaceId in chatSpaceCopy
      ? chatSpaceCopy[spaceId as keyof typeof chatSpaceCopy]
      : null;
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
  }, [heading, spaceId]);

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
        <CourierMark className="landing-mark mb-4 !h-[35.64px] !w-[37.2px] -translate-y-[2px]" />
        <h1 className="landing-headline heading-display text-center text-[1.85rem] md:text-[2.15rem]">
          {heading ?? "Leave the thinking to us."}
        </h1>
        <div className="mt-8 w-full">
          <Composer onSend={onPrompt} landing />
        </div>
      </div>
    </div>
  );
}
