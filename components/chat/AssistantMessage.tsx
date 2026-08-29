"use client";

import { useState } from "react";
import {
  Check,
  Circle,
  Copy,
  ThumbsDown,
  ThumbsUp,
  Undo2,
} from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer";
import { ThinkingIndicator } from "@/components/chat/ThinkingIndicator";
import { formatClarificationAnswersForDisplay } from "@/lib/ai/clarification/schema";
import { sanitizeAssistantVisibleText } from "@/lib/ai/tool-protocol";
import type { ChatBlock, Message } from "@/lib/types";
import { cn } from "@/lib/utils";

export function AssistantMessage({ message }: { message: Message }) {
  const pending = message.status === "pending";
  const streaming = message.status === "streaming";
  const showThinking =
    pending &&
    (!message.content ||
      message.content === "Thinking…" ||
      message.content === "Thinking...");
  const visibleContent = message.content
    ? sanitizeAssistantVisibleText(message.content)
    : "";

  return (
    <div className="w-full space-y-2">
      {showThinking ? (
        <ThinkingIndicator
          label={message.activity?.label || "Thinking"}
          detail={message.activity?.detail}
        />
      ) : visibleContent ? (
        <MarkdownRenderer content={visibleContent} />
      ) : null}
      {message.blocks
        ?.filter((b) => b.type !== "tool")
        .map((block, index) => (
          <BlockView key={index} block={block} />
        ))}
      {!showThinking && !streaming ? <MessageActions message={message} /> : null}
    </div>
  );
}

function MessageActions({ message }: { message: Message }) {
  const { sendMessage } = useApp();
  const [copied, setCopied] = useState(false);
  const [vote, setVote] = useState<"up" | "down" | null>(null);

  const copy = async () => {
    const parts = [
      message.content,
      ...(message.blocks ?? []).flatMap((block) => {
        if (block.type === "text") return [block.text];
        if (block.type === "plan") return [block.title, ...block.steps];
        if (block.type === "build")
          return [block.title, ...block.items.map((item) => item.label)];
        if (block.type === "tool") return [block.label];
        return [];
      }),
    ].filter(Boolean);
    await navigator.clipboard.writeText(parts.join("\n"));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="-ml-1.5 flex items-center gap-0.5 text-muted-foreground">
      <ActionBtn
        label="Revert"
        onClick={() => sendMessage("Undo what you just did")}
      >
        <Undo2 className="h-3.5 w-3.5" strokeWidth={1.6} />
      </ActionBtn>
      <ActionBtn
        label="Good response"
        active={vote === "up"}
        onClick={() => setVote((current) => (current === "up" ? null : "up"))}
      >
        <ThumbsUp className="h-3.5 w-3.5" strokeWidth={1.6} />
      </ActionBtn>
      <ActionBtn
        label="Bad response"
        active={vote === "down"}
        onClick={() => setVote((current) => (current === "down" ? null : "down"))}
      >
        <ThumbsDown className="h-3.5 w-3.5" strokeWidth={1.6} />
      </ActionBtn>
      <ActionBtn label={copied ? "Copied" : "Copy"} onClick={() => void copy()}>
        {copied ? (
          <Check className="h-3.5 w-3.5" strokeWidth={1.8} />
        ) : (
          <Copy className="h-3.5 w-3.5" strokeWidth={1.6} />
        )}
      </ActionBtn>
    </div>
  );
}

function ActionBtn({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-lg transition-colors duration-150 hover:bg-muted hover:text-foreground",
        active && "text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function BlockView({ block }: { block: ChatBlock }) {
  switch (block.type) {
    case "text":
      return (
        <p className="text-[14.5px] leading-relaxed text-muted-foreground">
          {block.text}
        </p>
      );
    case "plan":
      return <PlanBlock block={block} />;
    case "build":
      return <BuildBlock block={block} />;
    case "suggestions":
      return <SuggestionsRow block={block} />;
    case "secret":
      return <SecretBlock block={block} />;
    case "connect":
      return <ConnectBlock block={block} />;
    case "error":
      return <ErrorBlock block={block} />;
    case "deploy":
      return <DeployBlock block={block} />;
    case "tool":
      // Hard UI rule: never render tool chrome in the transcript.
      return null;
    case "clarification":
      return (
        <div className="my-1 rounded-[10px] border border-border/80 bg-muted/30 px-3 py-2 text-[13px]">
          <p className="font-medium tracking-[-0.01em]">{block.title}</p>
          <ul className="mt-1 space-y-0.5 text-muted-foreground">
            {formatClarificationAnswersForDisplay(block.answers).map((row) => (
              <li key={`${row.label}-${row.value}`}>
                <span className="text-foreground/80">{row.label}</span>:{" "}
                {row.value}
              </li>
            ))}
          </ul>
          {block.skipped ? (
            <p className="mt-1 text-[12px] text-muted-foreground">
              Some optional fields were skipped.
            </p>
          ) : null}
        </div>
      );
    case "image":
      return (
        <a
          href={block.url}
          target="_blank"
          rel="noopener noreferrer"
          className="my-1 block max-w-full overflow-hidden rounded-[10px] border border-border"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={block.url}
            alt={block.name}
            className="max-h-64 max-w-full object-contain"
          />
        </a>
      );
  }
}

function PlanBlock({
  block,
}: {
  block: Extract<ChatBlock, { type: "plan" }>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <p className="text-[14.5px] font-medium tracking-[-0.02em]">{block.title}</p>
      <ol className="mt-1.5 space-y-0.5 text-[14.5px] leading-relaxed text-muted-foreground">
        {block.steps.map((step, index) => (
          <li key={step}>
            {index + 1}. {step}
          </li>
        ))}
      </ol>
      {block.details ? (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="mt-2 text-[13px] text-muted-foreground hover:text-foreground"
        >
          {open ? "Hide details" : "View details"}
        </button>
      ) : null}
      {open && block.details ? (
        <pre className="mt-2 overflow-x-auto font-mono text-[12px] leading-relaxed text-muted-foreground">
          {block.details}
        </pre>
      ) : null}
    </div>
  );
}

function BuildBlock({
  block,
}: {
  block: Extract<ChatBlock, { type: "build" }>;
}) {
  const [open, setOpen] = useState(false);
  const { sendMessage } = useApp();
  return (
    <div>
      <p className="text-[14.5px] font-medium tracking-[-0.02em]">
        {block.complete ? "Build complete" : block.title}
      </p>
      <ul className="mt-1.5 space-y-0.5">
        {block.items.map((item) => (
          <li key={item.id} className="flex items-center gap-2 text-[14.5px]">
            {item.status === "done" ? (
              <Check className="h-3.5 w-3.5 text-foreground" strokeWidth={1.8} />
            ) : (
              <Circle
                className={cn(
                  "h-3.5 w-3.5",
                  item.status === "active"
                    ? "text-foreground"
                    : "text-muted-foreground/40",
                )}
                strokeWidth={1.6}
              />
            )}
            <span
              className={
                item.status === "pending" ? "text-muted-foreground" : ""
              }
            >
              {item.label}
            </span>
          </li>
        ))}
      </ul>
      {block.complete ? (
        <p className="mt-2 text-[14.5px] leading-relaxed text-muted-foreground">
          Preview updated successfully.
        </p>
      ) : null}
      {block.details ? (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="mt-2 text-[13px] text-muted-foreground hover:text-foreground"
        >
          {open ? "Hide details" : "View details"}
        </button>
      ) : null}
      {open && block.details ? (
        <pre className="mt-2 font-mono text-[12px] leading-relaxed text-muted-foreground">
          {block.details}
        </pre>
      ) : null}
      {block.complete ? (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Chip onClick={() => sendMessage("Show me what changed")}>
            View changes
          </Chip>
          <Chip onClick={() => sendMessage("Undo what you just did")}>Undo</Chip>
          <Chip onClick={() => sendMessage("Keep building")}>Keep building</Chip>
        </div>
      ) : null}
    </div>
  );
}

function SuggestionsRow({
  block,
}: {
  block: Extract<ChatBlock, { type: "suggestions" }>;
}) {
  const { sendMessage } = useApp();
  return (
    <div className="min-w-0">
      <p className="text-[12.5px] text-muted-foreground">{block.prompt}</p>
      <div className="mt-2 flex flex-nowrap gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {block.actions.map((action) => (
          <Chip key={action.id} onClick={() => sendMessage(action.label)}>
            {action.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}

function SecretBlock({
  block,
}: {
  block: Extract<ChatBlock, { type: "secret" }>;
}) {
  const { fillSecret } = useApp();
  const [value, setValue] = useState("");
  if (block.filled) {
    return (
      <p className="text-[14.5px] leading-relaxed">
        {block.service} is connected. The key is stored — it won’t appear in
        chat.
      </p>
    );
  }
  return (
    <div>
      <p className="text-[14.5px] font-medium tracking-[-0.02em]">
        {block.service} needs an API key
      </p>
      <p className="mt-1 text-[13.5px] text-muted-foreground">{block.keyName}</p>
      <input
        type="password"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Paste key"
        className="mt-3 h-10 w-full rounded-[10px] border border-border bg-muted px-3 text-[14px] outline-none"
      />
      <button
        type="button"
        onClick={() => fillSecret(block.keyName, value)}
        className="mt-3 inline-flex h-9 items-center rounded-full bg-primary px-4 text-[13.5px] font-medium text-primary-foreground hover:bg-foreground"
      >
        Add API key
      </button>
    </div>
  );
}

function ConnectBlock({
  block,
}: {
  block: Extract<ChatBlock, { type: "connect" }>;
}) {
  const { sendMessage } = useApp();
  if (block.status === "connected") {
    return (
      <p className="text-[14.5px]">{block.service} is connected to this app.</p>
    );
  }
  return (
    <div>
      <p className="text-[14.5px] font-medium tracking-[-0.02em]">
        Connect {block.service}
      </p>
      <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted-foreground">
        {"We'll wire it in. You won't paste secrets into source files."}
      </p>
      <button
        type="button"
        onClick={() => sendMessage(`Add the ${block.service} API key`)}
        className="mt-3 inline-flex h-9 items-center rounded-full bg-primary px-4 text-[13.5px] font-medium text-primary-foreground hover:bg-foreground"
      >
        Continue
      </button>
    </div>
  );
}

function ErrorBlock({
  block,
}: {
  block: Extract<ChatBlock, { type: "error" }>;
}) {
  const { sendMessage } = useApp();
  const [open, setOpen] = useState(false);
  return (
    <div>
      <p className="text-[14.5px] font-medium tracking-[-0.02em]">{block.title}</p>
      <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted-foreground">
        {block.body}
      </p>
      <div className="mt-3 flex flex-nowrap gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Chip onClick={() => sendMessage("Fix this automatically")}>
          Fix automatically
        </Chip>
        {block.details ? (
          <Chip onClick={() => setOpen((value) => !value)}>View details</Chip>
        ) : null}
      </div>
      {open && block.details ? (
        <pre className="mt-3 font-mono text-[12px] leading-relaxed text-muted-foreground">
          {block.details}
        </pre>
      ) : null}
    </div>
  );
}

function DeployBlock({
  block,
}: {
  block: Extract<ChatBlock, { type: "deploy" }>;
}) {
  const { openOverlay, setBuildTool } = useApp();
  return (
    <div>
      <p className="text-[14.5px] font-medium tracking-[-0.02em]">
        {block.status === "live" ? "Your app is live" : "Ready to publish"}
      </p>
      <p className="mt-1 font-mono text-[13px] text-muted-foreground">
        {block.url}
      </p>
      <div className="mt-3 flex flex-nowrap gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Chip onClick={() => window.open(block.url, "_blank")}>Open site</Chip>
        <Chip onClick={() => void navigator.clipboard.writeText(block.url)}>
          Copy URL
        </Chip>
        <Chip onClick={() => openOverlay("publish")}>Connect domain</Chip>
        <Chip onClick={() => setBuildTool("deployments")}>View deployment</Chip>
      </div>
    </div>
  );
}

function Chip({
  children,
  onClick,
}: {
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 rounded-full bg-muted px-3 py-1.5 text-[12.5px] font-medium tracking-[-0.01em] text-foreground hover:bg-accent"
    >
      {children}
    </button>
  );
}
