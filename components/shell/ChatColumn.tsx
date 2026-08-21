"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  Briefcase,
  Clapperboard,
  Globe,
  Hammer,
  HeartPulse,
  ImageIcon,
  Mic,
  Search,
  Sparkles,
  Telescope,
  Wallet,
} from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { CourierMark } from "@/components/brand/CourierMark";
import { ChatMessage } from "@/components/chat/MessageBlocks";
import { Composer } from "@/components/shell/Composer";
import { SuggestionPrompts } from "@/components/shell/SuggestionPrompts";
import { VoiceOrb } from "@/components/shell/VoiceOrb";
import { homeSuggestions } from "@/lib/suggestions";
import { spaceChatSuggestions } from "@/lib/space-suggestions";
import { chatSpaceCopy, spaceIconTint } from "@/lib/space-icons";
import type { SpaceId } from "@/lib/types";
import { cn } from "@/lib/utils";

const promptIcons = {
  p0: Briefcase,
  p1: Hammer,
  p2: ImageIcon,
  p3: Telescope,
  p4: Sparkles,
  p5: Clapperboard,
  p6: Wallet,
  p7: HeartPulse,
} as const;

export function ChatColumn() {
  const { thread, spaceId, sendMessage, drafting, view } = useApp();
  const browserMode = view === "browser";
  const showLanding = !browserMode && !thread && !drafting;
  const showSpacePrompts = !browserMode && !thread && !!spaceId;
  const spacePrompts = spaceChatSuggestions(spaceId);
  const endRef = useRef<HTMLDivElement>(null);
  const last = thread?.messages.at(-1);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [last?.id, last?.content, last?.blocks]);

  const send = (text: string) => {
    const go = () => sendMessage(text);
    if (
      showLanding &&
      !browserMode &&
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
        <div className="flex-1 overflow-y-auto px-5 py-6">
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

  return (
    <section className="@container relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      {showLanding ? (
        <EmptyChat spaceId={spaceId} onPrompt={send} />
      ) : (
        <div className="flex-1 overflow-y-auto px-5 py-6">
          <div className="mx-auto flex w-full max-w-[38rem] flex-col gap-6">
            {thread
              ? thread.messages.map((message) => (
                  <ChatMessage key={message.id} message={message} />
                ))
              : null}
            <div ref={endRef} />
          </div>
        </div>
      )}

      {showLanding ? null : (
        <>
          {showSpacePrompts && spacePrompts.length ? (
            <SuggestionPrompts items={spacePrompts} onSelect={send} />
          ) : null}
          <Composer onSend={send} />
        </>
      )}
    </section>
  );
}

function NewChatTabBar() {
  const { openBrowser, toggleVoice, openOverlay, voiceActive } = useApp();

  return (
    <div className="pointer-events-none absolute inset-x-0 top-[50px] z-10 flex justify-center px-4">
      <nav
        aria-label="New chat"
        className="pointer-events-auto inline-flex h-10 items-center gap-0.5 rounded-[12px] border border-border bg-transparent p-1"
      >
        <button
          type="button"
          onClick={() => openBrowser({ chat: true })}
          className="inline-flex h-8 items-center gap-1.5 rounded-[10px] px-3 text-[12.5px] font-medium tracking-[-0.01em] text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
        >
          <Globe className="h-3.5 w-3.5" strokeWidth={1.7} />
          Browser
        </button>

        {voiceActive ? (
          <button
            type="button"
            aria-label="Stop voice"
            aria-pressed
            onClick={() => toggleVoice()}
            className="inline-flex h-8 w-8 items-center justify-center rounded-[10px]"
          >
            <VoiceOrb active as="div" size={22} label="Stop voice" />
          </button>
        ) : (
          <button
            type="button"
            aria-label="Start voice"
            onClick={() => toggleVoice()}
            className="inline-flex h-8 items-center gap-1.5 rounded-[10px] px-3 text-[12.5px] font-medium tracking-[-0.01em] text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
          >
            <Mic className="h-3.5 w-3.5" strokeWidth={1.7} />
            Voice
          </button>
        )}

        <button
          type="button"
          onClick={() => openOverlay("search")}
          className="inline-flex h-8 items-center gap-1.5 rounded-[10px] px-3 text-[12.5px] font-medium tracking-[-0.01em] text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
        >
          <Search className="h-3.5 w-3.5" strokeWidth={1.7} />
          Search
        </button>
      </nav>
    </div>
  );
}

function EmptyChat({
  spaceId,
  onPrompt,
}: {
  spaceId: SpaceId | null;
  onPrompt: (text: string) => void;
}) {
  const inSpace = spaceId !== null;
  const heading =
    spaceId && spaceId in chatSpaceCopy
      ? chatSpaceCopy[spaceId as keyof typeof chatSpaceCopy]
      : null;
  const visible = inSpace ? [] : homeSuggestions();
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
  }, [visible.length, heading, inSpace]);

  return (
    <div
      ref={shellRef}
      className="relative flex flex-1 flex-col items-center justify-center px-8 py-10 md:justify-start"
    >
      <NewChatTabBar />
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
        {visible.length ? (
          <div className="landing-suggestions mt-3 grid w-full grid-cols-3 gap-2.5">
            {visible.map((item) => {
              const Icon =
                promptIcons[item.id as keyof typeof promptIcons] ?? Hammer;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onPrompt(item.label)}
                  className="flex min-h-[6.25rem] flex-col justify-between rounded-[15px] border border-border bg-transparent p-3 text-left transition-colors duration-200 hover:bg-muted"
                >
                  <Icon
                    className={cn("h-3.5 w-3.5", spaceIconTint(item.space))}
                    strokeWidth={1.6}
                  />
                  <span className="text-[12.5px] leading-snug tracking-[-0.02em]">
                    {item.label.replace(/\.$/, "")}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
