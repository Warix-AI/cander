"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Plus } from "lucide-react";
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer";
import { UserMessage } from "@/components/chat/UserMessage";
import {
  ComposerDictationButton,
  ComposerSendButton,
} from "@/components/shell/ComposerVoice";
import { useAdmin } from "@/components/admin/AdminProvider";
import { adminJson } from "@/lib/admin/client";
import { isAdminSection, type AdminSection } from "@/lib/admin/sections";
import { APP_MESSAGE_PLACEHOLDER } from "@/lib/app-brand";
import { SPLIT_CHAT_MAX_WIDTH } from "@/lib/right-panel";
import type { Message } from "@/lib/types";
import { cn } from "@/lib/utils";

type ChatTurnResponse = {
  ok: boolean;
  reply?: string;
  navigateTo?: AdminSection | null;
  accountId?: string | null;
  error?: string;
};

/** Center chat — Cander admin agent with tools over every workspace panel. */
export function AdminChatColumn({ className }: { className?: string }) {
  const {
    section,
    setSection,
    setSelectedAccountId,
    setMobileSurface,
  } = useAdmin();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "I’m Cander for Platform Admin. Ask about accounts, plans, pricing, usage, subscriptions, enterprise, audit, or ops — I’ll check the live data and open the matching panel.",
      createdAt: new Date().toISOString(),
    },
  ]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const sectionRef = useRef(section);
  sectionRef.current = section;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setDraft("");
    setBusy(true);
    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString(),
    };
    const historyForApi = [...messages, userMsg]
      .filter((m) => m.id !== "welcome")
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-12)
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    setMessages((prev) => [
      ...prev,
      userMsg,
      {
        id: `pending-${Date.now()}`,
        role: "assistant",
        content: "Checking…",
        status: "pending",
        createdAt: new Date().toISOString(),
      },
    ]);

    try {
      const result = await adminJson<ChatTurnResponse>("/api/admin/chat", {
        method: "POST",
        body: JSON.stringify({
          message: trimmed,
          history: historyForApi.slice(0, -1),
          currentSection: sectionRef.current,
        }),
      });

      if (result.navigateTo && isAdminSection(result.navigateTo)) {
        setSection(result.navigateTo);
        setMobileSurface("workspace");
      }
      if (result.accountId) {
        setSelectedAccountId(result.accountId);
      }

      const reply =
        result.reply?.trim() ||
        result.error ||
        "No reply from the admin assistant.";
      setMessages((prev) => {
        const withoutPending = prev.filter((m) => m.status !== "pending");
        return [
          ...withoutPending,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            content: reply,
            createdAt: new Date().toISOString(),
          },
        ];
      });
    } catch (err) {
      setMessages((prev) => {
        const withoutPending = prev.filter((m) => m.status !== "pending");
        return [
          ...withoutPending,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            content:
              err instanceof Error
                ? err.message
                : "Admin assistant request failed.",
            createdAt: new Date().toISOString(),
          },
        ];
      });
    } finally {
      setBusy(false);
      queueMicrotask(() => textRef.current?.focus());
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send(draft);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(draft);
    }
  }

  const canSend = Boolean(draft.trim()) && !busy;

  return (
    <section
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col bg-background",
        className,
      )}
    >
      <div className="chat-scroll flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <div
          className={cn(
            "mx-auto flex w-full flex-col gap-5",
            SPLIT_CHAT_MAX_WIDTH,
          )}
        >
          {messages.map((message) =>
            message.role === "user" ? (
              <div key={message.id} className="flex flex-col items-end gap-1">
                <UserMessage content={message.content} />
              </div>
            ) : (
              <div key={message.id} className="group/assistant w-full space-y-1">
                <MarkdownRenderer content={message.content} />
              </div>
            ),
          )}
          <div ref={endRef} />
          <div className="h-[30px] shrink-0" aria-hidden />
        </div>
      </div>

      <div className="composer-keyboard-pad shrink-0 px-4 pb-[max(0.75rem,calc(env(safe-area-inset-bottom)+0.7rem))] sm:px-6 sm:pb-4">
        <form
          onSubmit={onSubmit}
          className={cn("mx-auto w-full", SPLIT_CHAT_MAX_WIDTH)}
        >
          <div className="composer-shell bg-transparent px-2.5 py-1.5 dark:bg-input">
            <div className="flex min-h-8 items-end gap-1">
              <button
                type="button"
                aria-label="Add"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-foreground/5 hover:text-foreground"
                tabIndex={-1}
              >
                <Plus className="h-5 w-5" strokeWidth={2.25} />
              </button>
              <textarea
                ref={textRef}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  const el = e.currentTarget;
                  el.style.height = "auto";
                  el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
                }}
                onKeyDown={onKeyDown}
                rows={1}
                placeholder={APP_MESSAGE_PLACEHOLDER}
                disabled={busy}
                enterKeyHint="send"
                autoComplete="off"
                className="min-h-5 min-w-0 flex-1 resize-none overflow-y-auto bg-transparent py-1 text-[16px] leading-5 outline-none placeholder:text-muted-foreground sm:text-[14px]"
              />
              <ComposerDictationButton onClick={() => undefined} />
              {canSend ? (
                <ComposerSendButton onClick={() => void send(draft)} />
              ) : null}
            </div>
          </div>
        </form>
      </div>
    </section>
  );
}
