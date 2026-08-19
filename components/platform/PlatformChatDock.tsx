"use client";

import { useEffect, useRef, useState } from "react";
import { SquarePen, X } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { ChatMessage } from "@/components/chat/MessageBlocks";
import { Composer } from "@/components/shell/Composer";
import { NavToggle } from "@/components/shell/NavToggle";
import { SplitHandle } from "@/components/shell/SplitHandle";
import { Pill } from "@/components/spaces/ItemSet";
import { cn } from "@/lib/utils";

const PLACEHOLDER = "Ask about models, keys, hosting…";

export function PlatformAskButton() {
  const { platformDockOpen, setPlatformDockOpen } = useApp();
  if (platformDockOpen) return null;
  return (
    <Pill primary onClick={() => setPlatformDockOpen(true)}>
      Start Chat
    </Pill>
  );
}

export function PlatformChatDock() {
  const {
    platformMessages,
    sendPlatformMessage,
    setPlatformDockOpen,
    sidebarOpen,
    mobileNav,
    newChat,
  } = useApp();
  const endRef = useRef<HTMLDivElement>(null);
  const last = platformMessages.at(-1);
  const [ratio, setRatio] = useState(0.28);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [last?.id, last?.content]);

  return (
    <>
      <div
        className="flex min-h-0 shrink-0 flex-col bg-background transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{
          width: `${ratio * 100}%`,
          minWidth: "16rem",
          maxWidth: "28rem",
        }}
      >
        <header className="flex h-11 shrink-0 items-center gap-1 bg-background px-2">
          <NavToggle
            className={cn(
              sidebarOpen && "lg:hidden",
              mobileNav && "max-lg:hidden",
            )}
          />
          <button
            type="button"
            onClick={() => newChat()}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium tracking-[-0.01em] text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
          >
            <SquarePen className="h-3.5 w-3.5" strokeWidth={1.6} />
            New chat
          </button>
          <button
            type="button"
            aria-label="Close chat"
            onClick={() => setPlatformDockOpen(false)}
            className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" strokeWidth={1.6} />
          </button>
        </header>
        {platformMessages.length ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
            <div className="mx-auto flex w-full max-w-[38rem] flex-col gap-6">
              {platformMessages.map((message) => (
                <ChatMessage key={message.id} message={message} />
              ))}
              <div ref={endRef} />
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center px-5">
            <p className="mx-auto max-w-[38rem] text-center text-[13.5px] text-muted-foreground">
              {PLACEHOLDER}
            </p>
          </div>
        )}
        <Composer
          hideSpaceTools
          autoFocus
          placeholder={PLACEHOLDER}
          onSend={sendPlatformMessage}
        />
      </div>
      <SplitHandle label="Resize chat" onRatio={setRatio} />
    </>
  );
}
