"use client";

import { useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import {
  Briefcase,
  Clapperboard,
  Hammer,
  HeartPulse,
  ImageIcon,
  Sparkles,
  Telescope,
  Wallet,
} from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { CourierMark } from "@/components/brand/CourierMark";
import { ChatMessage } from "@/components/chat/MessageBlocks";
import { Composer } from "@/components/shell/Composer";
import { homeSuggestions } from "@/lib/suggestions";
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
    <section className="flex min-w-0 flex-1 flex-col bg-background">
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
  const inSpace = spaceId !== null;
  const heading =
    spaceId && spaceId in chatSpaceCopy
      ? chatSpaceCopy[spaceId as keyof typeof chatSpaceCopy]
      : null;
  const visible = inSpace ? [] : homeSuggestions();

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 py-10">
      <div className="flex w-full max-w-[44rem] flex-col items-center">
        <CourierMark className="landing-mark mb-4 -translate-y-[5px]" />
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
