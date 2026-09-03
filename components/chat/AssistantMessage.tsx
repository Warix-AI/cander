"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Circle, Copy } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer";
import {
  ImageGenerationCard,
  phaseForImageGenerationBlock,
} from "@/components/chat/ImageGenerationCard";
import { StructuredResponseBlock } from "@/components/chat/StructuredResponseBlock";
import { AddReplyToProjectMenu } from "@/components/chat/AddReplyToProjectMenu";
import { ThinkingIndicator } from "@/components/chat/ThinkingIndicator";
import { formatClarificationAnswersForDisplay } from "@/lib/ai/clarification/schema";
import { sanitizeAssistantVisibleText } from "@/lib/ai/tool-protocol";
import type { ChatBlock, Message } from "@/lib/types";
import { cn } from "@/lib/utils";
import { faviconUrlForSite } from "@/lib/preview-url";
import { isCdnCitationHost } from "@/lib/ai/orchestrator/citations";
import { SHELL_G3_RADIUS } from "@/lib/shell-chrome";

function blockKey(block: ChatBlock, index: number): string {
  switch (block.type) {
    case "image_generation":
      return `gen-${block.generationId}`;
    case "image":
      return `img-${block.attachmentId ?? block.url.slice(0, 48)}`;
    case "build":
      return `build-${block.title}-${index}`;
    case "clarification":
      return `clarify-${block.title}-${index}`;
    default:
      return `${block.type}-${index}`;
  }
}

export function AssistantMessage({ message }: { message: Message }) {
  const { thread, openInAppBrowser } = useApp();
  const pending = message.status === "pending";
  const streaming = message.status === "streaming";
  const visibleContent = message.content
    ? sanitizeAssistantVisibleText(message.content)
    : "";
  const hasReply =
    Boolean(visibleContent) &&
    visibleContent !== "Thinking…" &&
    visibleContent !== "Thinking...";

  const inFlight = pending || streaming;
  const hasGeneratingImage = Boolean(
    message.blocks?.some(
      (block) =>
        block.type === "image_generation" && block.status === "generating",
    ),
  );
  const showActivityRow =
    inFlight &&
    !hasGeneratingImage &&
    Boolean(message.activity?.phase || message.activity?.startedAt);

  return (
    <div className="w-full space-y-2">
      {showActivityRow ? (
        <ThinkingIndicator
          active
          phase={message.activity?.phase}
          startedAt={message.activity?.startedAt}
          label={message.activity?.label}
        />
      ) : null}
      {hasReply ? (
        <div className="pb-0">
          <MarkdownRenderer
            content={visibleContent}
            onLinkClick={(href) => openInAppBrowser(href)}
          />
        </div>
      ) : null}
      {message.blocks
        ?.filter((b) => b.type !== "tool")
        .map((block, index) => (
          <BlockView
            key={blockKey(block, index)}
            block={block}
            messageId={message.id}
            threadId={thread?.id}
          />
        ))}
      {!pending && !streaming ? (
        <MessageFooter message={message} visibleContent={visibleContent} />
      ) : null}
    </div>
  );
}

function MessageFooter({
  message,
  visibleContent,
}: {
  message: Message;
  visibleContent: string;
}) {
  const citations = message.citations;
  const hasCopy = Boolean(visibleContent);
  const hasSources = Boolean(citations?.length);
  if (!hasCopy && !hasSources) return null;

  return (
    <div className="pt-0.5">
      <ActionSourcesRow
        message={message}
        citations={citations}
        showCopy={hasCopy}
        visibleContent={visibleContent}
      />
    </div>
  );
}

function ActionSourcesRow({
  message,
  citations,
  showCopy,
  visibleContent,
}: {
  message: Message;
  citations?: Message["citations"];
  showCopy: boolean;
  visibleContent: string;
}) {
  const { openInAppBrowser } = useApp();
  const [moreOpen, setMoreOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  const safe = (citations ?? []).filter((c) => {
    try {
      const u = new URL(c.url);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  });
  const seen = new Set<string>();
  const unique = safe
    .filter((c) => {
      const key = (c.canonicalUrl || c.url).replace(/\/$/, "").toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      const aCdn = isCdnCitationHost(a.url) ? 1 : 0;
      const bCdn = isCdnCitationHost(b.url) ? 1 : 0;
      return aCdn - bCdn;
    });

  const labelFor = (c: NonNullable<Message["citations"]>[number]) => {
    if (c.domain) return c.domain;
    try {
      return new URL(c.url).hostname.replace(/^www\./, "");
    } catch {
      return c.title.slice(0, 24) || "Source";
    }
  };

  const titleFor = (c: NonNullable<Message["citations"]>[number]) => {
    const title = (c.title || "").trim();
    if (
      title &&
      !/^https?:\/\//i.test(title) &&
      title !== c.url &&
      !isCdnCitationHost(title)
    ) {
      return title;
    }
    const host = labelFor(c);
    if (host && !isCdnCitationHost(host) && !isCdnCitationHost(c.url)) {
      return host;
    }
    return "Source";
  };

  const primary = unique[0];
  const extra = unique.slice(1);

  useEffect(() => {
    if (!moreOpen) return;
    const onPointer = (event: PointerEvent) => {
      if (!moreRef.current?.contains(event.target as Node)) {
        setMoreOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [moreOpen]);

  const copy = async () => {
    const parts = [
      visibleContent,
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

  const openSource = (c: NonNullable<Message["citations"]>[number]) => {
    setMoreOpen(false);
    openInAppBrowser(c.url, { title: titleFor(c) });
  };

  return (
    <div>
      {primary ? (
        <div className="relative mb-0.5 w-fit max-w-full" ref={moreRef}>
          <div
            className={cn(
              "inline-flex w-fit max-w-full items-center gap-1 py-[3px] pl-1.5 pr-1",
              SHELL_G3_RADIUS,
              "text-muted-foreground transition-colors duration-150",
              "hover:bg-muted hover:text-foreground",
              moreOpen && "bg-muted text-foreground",
            )}
          >
            <button
              type="button"
              onClick={() => openSource(primary)}
              title={primary.url}
              className="inline-flex min-w-0 max-w-[9.5rem] items-center gap-1 text-[10px] font-medium leading-none tracking-[-0.01em]"
            >
              {(() => {
                const favicon = faviconUrlForSite(primary.url, 32);
                return favicon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={favicon}
                    alt=""
                    width={12}
                    height={12}
                    className="h-3 w-3 shrink-0 rounded-full"
                  />
                ) : (
                  <span className="h-3 w-3 shrink-0 rounded-full bg-muted-foreground/30" />
                );
              })()}
              <span className="truncate">{titleFor(primary)}</span>
            </button>

            {extra.length ? (
              <button
                type="button"
                onClick={() => setMoreOpen((open) => !open)}
                aria-expanded={moreOpen}
                aria-label={`${extra.length} more sources`}
                className="inline-flex h-3.5 shrink-0 items-center rounded-full bg-black/[0.06] px-1 text-[9px] font-medium leading-none tabular-nums text-muted-foreground dark:bg-white/12"
              >
                +{extra.length}
              </button>
            ) : null}
          </div>

          {moreOpen && extra.length ? (
            <ul className="absolute left-0 top-[calc(100%+4px)] z-30 min-w-[12rem] max-w-[18rem] overflow-hidden rounded-[10px] border border-border/70 bg-card py-0.5 shadow-lg">
              {extra.map((c) => {
                const favicon = faviconUrlForSite(c.url, 32);
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => openSource(c)}
                      className="flex w-full items-center gap-1.5 px-2 py-1 text-left hover:bg-muted/60"
                    >
                      {favicon ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={favicon}
                          alt=""
                          width={12}
                          height={12}
                          className="h-3 w-3 shrink-0 rounded-full"
                        />
                      ) : (
                        <span className="h-3 w-3 shrink-0 rounded-full bg-muted" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[11px] font-medium text-foreground">
                          {titleFor(c)}
                        </span>
                        <span className="block truncate text-[10px] text-muted-foreground">
                          {isCdnCitationHost(c.url) ? "Source" : labelFor(c)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center gap-1.5">
        {showCopy ? (
          <button
            type="button"
            title={copied ? "Copied" : "Copy"}
            aria-label={copied ? "Copied" : "Copy"}
            onClick={() => void copy()}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5" strokeWidth={1.8} />
            ) : (
              <Copy className="h-3.5 w-3.5" strokeWidth={1.6} />
            )}
          </button>
        ) : null}

        {showCopy ? (
          <AddReplyToProjectMenu
            message={message}
            visibleContent={visibleContent}
          />
        ) : null}
      </div>
    </div>
  );
}

function BlockView({
  block,
  messageId,
  threadId,
}: {
  block: ChatBlock;
  messageId?: string;
  threadId?: string;
}) {
  switch (block.type) {
    case "text":
      return (
        <div className="text-[14.5px] leading-relaxed text-muted-foreground">
          <MarkdownRenderer content={block.text} />
        </div>
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
      if (!block.url?.trim()) return null;
      return (
        <ImageGenerationCard
          cardId={block.attachmentId ?? `img-${block.url.slice(0, 48)}`}
          phase="complete"
          imageUrl={block.url}
          name={block.name}
          instant
        />
      );
    case "image_generation":
      return (
        <ImageGenerationJobBlock
          block={block}
          messageId={messageId}
          threadId={threadId}
        />
      );
    case "file":
      return null;
    case "user_connector":
      // User-bubble only — never render in assistant transcript chrome.
      return null;
    case "process":
    case "hierarchy":
    case "decision_matrix":
    case "pros_cons":
    case "ranking":
    case "status":
    case "before_after":
    case "faq":
    case "comparison_card":
      return <StructuredResponseBlock block={block} />;
  }
}

function ImageGenerationJobBlock({
  block,
  messageId,
  threadId,
}: {
  block: Extract<ChatBlock, { type: "image_generation" }>;
  messageId?: string;
  threadId?: string;
}) {
  const { retryImageGeneration } = useApp();
  const [retrying, setRetrying] = useState(false);

  return (
    <ImageGenerationCard
      cardId={block.generationId}
      phase={phaseForImageGenerationBlock(block)}
      imageUrl={block.imageUrl}
      name={block.name || "generated.png"}
      error={block.error}
      onRetry={
        threadId && messageId
          ? () => {
              setRetrying(true);
              retryImageGeneration(
                block.generationId,
                threadId,
                messageId,
                block.prompt,
              );
              setRetrying(false);
            }
          : undefined
      }
      retrying={retrying}
    />
  );
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
  const { openOverlay, setBuildTool, openInAppBrowser } = useApp();
  return (
    <div>
      <p className="text-[14.5px] font-medium tracking-[-0.02em]">
        {block.status === "live" ? "Your app is live" : "Ready to publish"}
      </p>
      <p className="mt-1 font-mono text-[13px] text-muted-foreground">
        {block.url}
      </p>
      <div className="mt-3 flex flex-nowrap gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Chip onClick={() => openInAppBrowser(block.url)}>Open site</Chip>
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
