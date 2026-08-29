"use client";

import { AssistantMessage } from "@/components/chat/AssistantMessage";
import { CondensedContextIndicator } from "@/components/chat/CondensedContextIndicator";
import { UserMessage } from "@/components/chat/UserMessage";
import type { Message } from "@/lib/types";

export function ChatMessage({ message }: { message: Message }) {
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
      <div className="flex flex-col items-end">
        <UserMessage content={message.content} blocks={message.blocks} />
      </div>
    );
  }
  if (message.role === "system") {
    return null;
  }
  return (
    <div className="flex flex-col items-start">
      <AssistantMessage message={message} />
    </div>
  );
}

// Re-export for any legacy imports of block helpers from this path.
export { ToolCallBlock } from "@/components/chat/ToolCallBlock";
