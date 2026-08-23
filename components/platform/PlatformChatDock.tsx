"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { ChatMessage } from "@/components/chat/MessageBlocks";
import { SessionSummaryBubble } from "@/components/chat/SessionSummaryBubble";
import { Composer } from "@/components/shell/Composer";
import { MobileSurfaceToggle } from "@/components/shell/MobileSurfaceChrome";
import { NavToggle } from "@/components/shell/NavToggle";
import { SuggestionPrompts } from "@/components/shell/SuggestionPrompts";
import { GhostBtn } from "@/components/platform/DevChrome";
import { useMobileShell } from "@/lib/use-media-query";
import { platformChatSuggestions } from "@/lib/platform-suggestions";
import { cn } from "@/lib/utils";

const PLACEHOLDER = "Ask about models, keys, hosting…";

export function PlatformAskButton() {
  const { platformDockOpen, setPlatformDockOpen } = useApp();
  if (platformDockOpen) return null;
  return (
    <GhostBtn primary onClick={() => setPlatformDockOpen(true)}>
      Ask
    </GhostBtn>
  );
}

/** Chat column for Development — mirrors Courier ChatColumn suggestions + dock. */
export function PlatformChatColumn() {
  const {
    platformMessages,
    sendPlatformMessage,
    setPlatformDockOpen,
    sidebarOpen,
    mobileNav,
    platformNav,
    threads,
    platformThreadId,
  } = useApp();
  const mobile = useMobileShell();
  const endRef = useRef<HTMLDivElement>(null);
  const last = platformMessages.at(-1);
  const suggestions = platformChatSuggestions(platformNav);
  const empty = platformMessages.length === 0;
  const platformThread =
    threads.find((item) => item.id === platformThreadId) ?? null;
  const summary = platformThread?.sessionSummary;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [last?.id, last?.content]);

  return (
    <section className="@container relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <header className="flex h-11 shrink-0 items-center gap-1 bg-background px-2">
        <NavToggle
          className={cn(
            "mr-auto",
            sidebarOpen && "lg:hidden",
            mobileNav && "max-lg:hidden",
          )}
        />
        {mobile ? <MobileSurfaceToggle /> : null}
        <button
          type="button"
          aria-label="Close chat"
          onClick={() => setPlatformDockOpen(false)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" strokeWidth={1.6} />
        </button>
      </header>

      {empty && !summary ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-3 sm:px-5">
          <div className="mx-auto w-full max-w-[38rem] text-center">
            <p className="text-[15px] font-medium tracking-[-0.02em] text-muted-foreground">
              Ask Development
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              Models, keys, hosting, APIs — ask anything about this workspace’s
              runtime.
            </p>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-5 sm:py-6">
          <div className="mx-auto flex w-full max-w-[38rem] flex-col gap-6">
            {summary && platformThread ? (
              <SessionSummaryBubble
                threadId={platformThread.id}
                summary={summary}
              />
            ) : null}
            {platformMessages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}
            <div ref={endRef} />
          </div>
        </div>
      )}

      {empty ? (
        <SuggestionPrompts items={suggestions} onSelect={sendPlatformMessage} />
      ) : null}

      <Composer
        hideSpaceTools
        autoFocus
        placeholder={PLACEHOLDER}
        onSend={sendPlatformMessage}
      />
    </section>
  );
}
