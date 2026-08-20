"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Send } from "lucide-react";
import { handshakeAssistantReply } from "@/lib/handshake-chat";
import { cn } from "@/lib/utils";

type Msg = { id: string; role: "user" | "assistant"; content: string };

export function HandshakeAssistant() {
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<Msg[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Ask about permissions, recent activity, AI readiness, or connected capabilities.",
    },
  ]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    const userMsg: Msg = { id: `u-${Date.now()}`, role: "user", content: text };
    const reply: Msg = {
      id: `a-${Date.now()}`,
      role: "assistant",
      content: handshakeAssistantReply(text),
    };
    setMessages((current) => [...current, userMsg, reply]);
    setDraft("");
  };

  return (
    <div className="shrink-0 border-t border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left"
      >
        <span className="text-[12px] font-medium tracking-[-0.01em]">
          Handshake assistant
        </span>
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" strokeWidth={1.6} />
        ) : (
          <ChevronUp className="h-4 w-4 text-muted-foreground" strokeWidth={1.6} />
        )}
      </button>
      {open ? (
        <div className="border-t border-border/70 px-4 pb-3">
          <div className="max-h-36 space-y-2 overflow-y-auto py-2">
            {messages.map((msg) => (
              <p
                key={msg.id}
                className={cn(
                  "text-[12.5px] leading-relaxed",
                  msg.role === "user"
                    ? "text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {msg.content}
              </p>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") send();
              }}
              placeholder="Explain my Handshake permissions…"
              className="h-9 min-w-0 flex-1 rounded-full border border-border bg-background px-3 text-[13px] outline-none placeholder:text-muted-foreground focus:border-foreground/20"
            />
            <button
              type="button"
              aria-label="Send"
              onClick={send}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background hover:opacity-90"
            >
              <Send className="h-3.5 w-3.5" strokeWidth={1.8} />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
