"use client";

import { useApp } from "@/components/app/AppProvider";
import { Composer } from "@/components/shell/Composer";
import { prompts } from "@/lib/data";
import { chatSpaceCopy } from "@/lib/space-icons";
import { isChatSpace } from "@/lib/spaces";
import type { SpaceId } from "@/lib/types";

export function ChatColumn() {
  const { thread, spaceId, sendMessage, drafting } = useApp();
  const showLanding = !thread && !drafting;

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-background">
      {showLanding ? (
        <EmptyChat spaceId={spaceId} onPrompt={sendMessage} />
      ) : (
        <div className="flex-1 overflow-y-auto px-5 py-6">
          <div className="mx-auto flex w-full max-w-[38rem] flex-col gap-6">
            {thread
              ? thread.messages.map((message) => (
                  <div key={message.id}>
                    <p className="text-[11.5px] font-medium tracking-[-0.01em] text-muted-foreground">
                      {message.role === "user" ? "You" : "Courier"}
                      <span className="ml-2 font-mono font-normal">
                        {message.at}
                      </span>
                    </p>
                    <p className="mt-1.5 text-[14.5px] leading-relaxed tracking-[-0.01em]">
                      {message.content}
                    </p>
                  </div>
                ))
              : null}
          </div>
        </div>
      )}

      <Composer onSend={sendMessage} />
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
  const copy = isChatSpace(spaceId) ? chatSpaceCopy[spaceId] : null;
  const visible = spaceId
    ? [
        ...prompts.filter((p) => p.space === spaceId),
        ...prompts.filter((p) => p.space !== spaceId),
      ]
    : prompts.filter((p) => isChatSpace(p.space));

  return (
    <div className="flex flex-1 flex-col justify-center px-5">
      <div className="mx-auto w-full max-w-[38rem]">
        <h1 className="heading-display text-[1.65rem] md:text-[1.85rem]">
          {copy?.heading ?? "What are we working on?"}
        </h1>
        <p className="mt-2 max-w-md text-[13.5px] leading-relaxed text-muted-foreground">
          {copy?.body ??
            "Start in Auto. Pick Build, Studio, Research, or Skills — typing opens that workspace."}
        </p>
        <div className="mt-6 flex flex-col gap-1">
          {visible.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onPrompt(item.label)}
              className="rounded-lg px-3 py-2.5 text-left text-[13.5px] text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
