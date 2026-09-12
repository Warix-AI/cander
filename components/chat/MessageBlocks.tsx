"use client";

import { AssistantMessage } from "@/components/chat/AssistantMessage";
import { CondensedContextIndicator } from "@/components/chat/CondensedContextIndicator";
import { UserMessage } from "@/components/chat/UserMessage";
import type { Message } from "@/lib/types";

export function ChatMessage({
  message,
  speakerLabels,
}: {
  message: Message;
  /** Optional names for Expert runtime (user = Expert, assistant = Cander). */
  speakerLabels?: { user?: string; assistant?: string } | null;
}) {
  // Space-switch markers stay in history for routing, but no longer render
  // the icon arrow diagram in the transcript.
  if (message.spaceSwitch) return null;
  if (message.event === "condensed") {
    return <CondensedContextIndicator />;
  }
  if (message.content === "__CHAT_CONDENSED__") {
    return <CondensedContextIndicator />;
  }
  if (message.role === "user") {
    return (
      <div className="flex flex-col items-end gap-1">
        {speakerLabels?.user ? (
          <span className="px-1 font-mono text-[10px] tracking-[0.06em] text-muted-foreground uppercase">
            {speakerLabels.user}
          </span>
        ) : null}
        <UserMessage content={message.content} blocks={message.blocks} />
      </div>
    );
  }
  if (message.role === "system") {
    return null;
  }
  return (
    <div className="flex flex-col items-start gap-1">
      {speakerLabels?.assistant ? (
        <span className="px-1 font-mono text-[10px] tracking-[0.06em] text-muted-foreground uppercase">
          {speakerLabels.assistant}
        </span>
      ) : null}
      <AssistantMessage message={message} />
    </div>
  );
}

// Re-export for any legacy imports of block helpers from this path.
export { ToolCallBlock } from "@/components/chat/ToolCallBlock";
