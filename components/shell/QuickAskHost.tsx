"use client";

/**
 * Quick Ask mini window — ephemeral until submit, then creates a normal thread
 * via the existing AppProvider send path (no second chat engine).
 */

import { useEffect, useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import { isDesktopQuickAskEnabled } from "@/lib/native/flags";
import { isDesktopShell } from "@/lib/desktop-shell";
import { getNativeCapabilities } from "@/lib/native";

function isQuickAskMode() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("quickAsk") === "1";
}

export function QuickAskHost() {
  const { sendMessage, armChatInterface } = useApp();
  const [text, setText] = useState("");
  const [active, setActive] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!isDesktopQuickAskEnabled() || !isDesktopShell()) return;
    setActive(isQuickAskMode());
  }, []);

  if (!active) return null;

  const submit = () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      armChatInterface("work");
      // On submit: create a normal thread through the existing orchestrator path.
      sendMessage(body);
      setText("");
      void getNativeCapabilities().desktop?.showMainWindow?.();
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/20 p-6 pt-[12vh]">
      <div className="w-full max-w-md rounded-[14px] border border-border bg-background p-4 shadow-lg">
        <p className="mb-2 text-[13px] font-medium tracking-tight text-foreground">
          Quick Ask
        </p>
        <textarea
          className="min-h-[88px] w-full resize-none rounded-[10px] border border-border bg-transparent px-3 py-2 text-[15px] outline-none"
          placeholder="Ask Cander…"
          value={text}
          autoFocus
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-full px-3 py-1.5 text-[13px] text-muted-foreground"
            onClick={() => window.close()}
          >
            Close
          </button>
          <button
            type="button"
            className="rounded-full bg-foreground px-4 py-1.5 text-[13px] font-medium text-background disabled:opacity-50"
            disabled={!text.trim() || sending}
            onClick={() => submit()}
          >
            {sending ? "Sending…" : "Ask"}
          </button>
        </div>
      </div>
    </div>
  );
}
