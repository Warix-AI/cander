"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { ChatMessage } from "@/components/chat/MessageBlocks";
import { Composer } from "@/components/shell/Composer";
import { NavToggle } from "@/components/shell/NavToggle";
import { SuggestionPrompts } from "@/components/shell/SuggestionPrompts";
import { DashBtn } from "@/components/spaces/ItemSet";
import { platformChatSuggestions } from "@/lib/platform-suggestions";
import { cn } from "@/lib/utils";

const PLACEHOLDER = "Ask about models, keys, hosting…";

export function PlatformAskButton() {
  const { platformDockOpen, setPlatformDockOpen } = useApp();
  if (platformDockOpen) return null;
  return (
    <DashBtn primary onClick={() => setPlatformDockOpen(true)}>
      New chat
    </DashBtn>
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
  } = useApp();
  const endRef = useRef<HTMLDivElement>(null);
  const last = platformMessages.at(-1);
  const suggestions = platformChatSuggestions(platformNav);
  const empty = platformMessages.length === 0;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [last?.id, last?.content]);

  return (
    <section className="@container relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <header className="flex h-11 shrink-0 items-center gap-1 bg-background px-2">
        <NavToggle
          className={cn(
            sidebarOpen && "lg:hidden",
            mobileNav && "max-lg:hidden",
          )}
        />
        <button
          type="button"
          aria-label="Close chat"
          onClick={() => setPlatformDockOpen(false)}
          className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" strokeWidth={1.6} />
        </button>
      </header>

      {empty ? (
        <div className="min-h-0 flex-1" />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
          <div className="mx-auto flex w-full max-w-[38rem] flex-col gap-6">
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
