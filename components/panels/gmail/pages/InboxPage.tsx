"use client";

import { useState } from "react";
import { Paperclip } from "lucide-react";
import { SectionLabel } from "@/components/panels/Bits";
import {
  gmailInbox,
  gmailThreadMessages,
  type GmailMessage,
} from "@/lib/gmail";
import { cn } from "@/lib/utils";

export function InboxPage() {
  const [selectedId, setSelectedId] = useState<string | null>(
    gmailInbox[0]?.id ?? null,
  );

  const results = gmailInbox;
  const selected =
    results.find((item) => item.id === selectedId) ?? results[0] ?? null;
  const thread = selected
    ? (gmailThreadMessages[selected.threadId] ?? [selected])
    : [];

  return (
    <div className="flex h-full min-h-[28rem] flex-col">
      <div className="flex min-h-0 flex-1">
        <div className="w-[44%] min-w-[11rem] overflow-y-auto border-r border-border">
          <SectionLabel>{`Results · ${results.length}`}</SectionLabel>
          {results.map((item) => (
            <MessageRow
              key={item.id}
              item={item}
              active={selected?.id === item.id}
              onClick={() => setSelectedId(item.id)}
            />
          ))}
          {!results.length ? (
            <p className="px-3 py-4 text-[12.5px] text-muted-foreground">
              No messages.
            </p>
          ) : null}
        </div>

        <div className="min-w-0 flex-1 overflow-y-auto">
          {selected ? (
            <ThreadView threadId={selected.threadId} messages={thread} />
          ) : (
            <p className="p-4 text-[13px] text-muted-foreground">
              Select a message to open the thread.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function MessageRow({
  item,
  active,
  onClick,
}: {
  item: GmailMessage;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full flex-col gap-0.5 border-b border-border px-3 py-2.5 text-left transition-colors hover:bg-muted/50",
        active && "bg-muted",
        item.unread && "bg-muted/30",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "truncate text-[12.5px]",
            item.unread ? "font-semibold" : "font-medium",
          )}
        >
          {item.from.split("<")[0].trim()}
        </span>
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
          {item.time}
        </span>
      </div>
      <p
        className={cn(
          "truncate text-[12.5px]",
          item.unread ? "font-medium" : "text-foreground/90",
        )}
      >
        {item.subject}
      </p>
      <p className="flex items-center gap-1.5 truncate text-[11.5px] text-muted-foreground">
        {item.hasAttachment ? (
          <Paperclip className="h-3 w-3 shrink-0" strokeWidth={1.6} />
        ) : null}
        <span className="truncate">{item.snippet}</span>
      </p>
    </button>
  );
}

function ThreadView({
  threadId,
  messages,
}: {
  threadId: string;
  messages: GmailMessage[];
}) {
  return (
    <div className="p-4">
      <p className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
        get_gmail_thread_content · {threadId}
      </p>
      <h2 className="mt-2 text-[15px] font-semibold tracking-[-0.02em]">
        {messages[0]?.subject}
      </h2>
      <div className="mt-4 space-y-3">
        {messages.map((message) => (
          <article
            key={message.id}
            className="rounded-[10px] border border-border bg-card p-3.5"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium">{message.from}</p>
                <p className="truncate text-[11.5px] text-muted-foreground">
                  to {message.to}
                </p>
              </div>
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                {message.time}
              </span>
            </div>
            <pre className="mt-3 whitespace-pre-wrap font-sans text-[13px] leading-relaxed">
              {message.body}
            </pre>
            {message.hasAttachment ? (
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-[11.5px]">
                <Paperclip className="h-3 w-3" strokeWidth={1.6} />
                get_gmail_attachment_content · Q3-deck.pdf
              </p>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}
