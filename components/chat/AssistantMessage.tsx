"use client";

import { useEffect, useState } from "react";
import { Check, Circle, Copy, Download, RotateCcw } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer";
import { ThinkingIndicator } from "@/components/chat/ThinkingIndicator";
import { formatClarificationAnswersForDisplay } from "@/lib/ai/clarification/schema";
import { sanitizeAssistantVisibleText } from "@/lib/ai/tool-protocol";
import { saveGeneratedImage } from "@/lib/native/save-image";
import { isMobileShell } from "@/lib/mobile-shell";
import type { ChatBlock, Message } from "@/lib/types";
import { cn } from "@/lib/utils";

export function AssistantMessage({ message }: { message: Message }) {
  const { thread } = useApp();
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

  const [holdThinking, setHoldThinking] = useState(showThinking);
  useEffect(() => {
    if (showThinking) {
      setHoldThinking(true);
      return;
    }
    if (!holdThinking) return;
    const id = window.setTimeout(() => setHoldThinking(false), 340);
    return () => window.clearTimeout(id);
  }, [showThinking, holdThinking]);

  return (
    <div className="w-full space-y-2">
      {showThinking || holdThinking ? (
        <ThinkingIndicator
          active={showThinking}
          phase={message.activity?.phase}
          startedAt={message.activity?.startedAt}
          label={message.activity?.label}
        />
      ) : null}
      {!showThinking && visibleContent ? (
        <div className="assistant-reply-enter">
          <MarkdownRenderer content={visibleContent} />
        </div>
      ) : null}
      {message.blocks
        ?.filter((b) => b.type !== "tool")
        .map((block, index) => (
          <BlockView
            key={index}
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
    <div className="pt-1.5">
      <ActionSourcesRow message={message} citations={citations} showCopy={hasCopy} />
    </div>
  );
}

function ActionSourcesRow({
  message,
  citations,
  showCopy,
}: {
  message: Message;
  citations?: Message["citations"];
  showCopy: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const safe = (citations ?? []).filter((c) => {
    try {
      const u = new URL(c.url);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  });
  const seen = new Set<string>();
  const unique = safe.filter((c) => {
    const key = (c.canonicalUrl || c.url).replace(/\/$/, "").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const labelFor = (c: NonNullable<Message["citations"]>[number]) => {
    if (c.domain) return c.domain;
    try {
      return new URL(c.url).hostname.replace(/^www\./, "");
    } catch {
      return c.title.slice(0, 24) || "Source";
    }
  };

  const faviconFor = (url: string) => {
    try {
      const host = new URL(url).hostname;
      return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`;
    } catch {
      return null;
    }
  };

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
    <div>
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

        {unique.length ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex h-7 items-center gap-2 rounded-lg px-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-expanded={expanded}
            aria-label={`Sources, ${unique.length}`}
          >
            <span className="flex items-center pl-0.5">
              {unique.slice(0, 4).map((c, i) => {
                const favicon = faviconFor(c.url);
                return (
                  <span
                    key={c.id}
                    className="relative inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded-full border border-background bg-muted ring-1 ring-border/60"
                    style={{ marginLeft: i === 0 ? 0 : -6, zIndex: 4 - i }}
                  >
                    {favicon ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={favicon}
                        alt=""
                        width={14}
                        height={14}
                        className="h-3.5 w-3.5"
                      />
                    ) : (
                      <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                    )}
                  </span>
                );
              })}
            </span>
            <span className="text-[12px] font-medium tracking-[-0.01em]">
              Sources
            </span>
          </button>
        ) : null}
      </div>

      {expanded && unique.length ? (
        <ul className="mt-2 space-y-1.5 rounded-[10px] border border-border/70 bg-muted/20 px-2.5 py-2">
          {unique.map((c) => {
            const favicon = faviconFor(c.url);
            return (
              <li key={c.id}>
                <a
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-2 rounded-lg px-1.5 py-1.5 hover:bg-muted/50"
                >
                  {favicon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={favicon}
                      alt=""
                      width={16}
                      height={16}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded-[3px]"
                    />
                  ) : (
                    <span className="mt-0.5 h-4 w-4 shrink-0 rounded-[3px] bg-muted" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium tracking-[-0.01em] text-foreground">
                      {c.title || labelFor(c)}
                    </span>
                    <span className="block truncate text-[12px] text-muted-foreground">
                      {labelFor(c)}
                    </span>
                    {c.excerpt ? (
                      <span className="mt-0.5 line-clamp-2 block text-[12px] leading-snug text-muted-foreground/90">
                        {c.excerpt}
                      </span>
                    ) : null}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      ) : null}
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
      return <GeneratedImageBlock block={block} />;
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
  }
}

function GeneratedImageBlock({
  block,
}: {
  block: Extract<ChatBlock, { type: "image" }>;
}) {
  const [saving, setSaving] = useState(false);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [displayUrl, setDisplayUrl] = useState(block.url);
  const mobile = isMobileShell();

  useEffect(() => {
    if (!block.url.startsWith("data:")) {
      setDisplayUrl(block.url);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    void fetch(block.url)
      .then((response) => response.blob())
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setDisplayUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setDisplayUrl(block.url);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [block.url]);

  return (
    <div className="my-1 flex max-w-md flex-col gap-1">
      <div className="flex max-w-full items-center gap-2">
        <div className="relative aspect-square min-w-0 flex-1 overflow-hidden rounded-[14px] border border-border bg-muted/20">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={displayUrl}
            alt={block.name}
            draggable={false}
            className="absolute inset-0 h-full w-full object-cover select-none"
            style={mobile ? { WebkitTouchCallout: "none" } : undefined}
            onContextMenu={(event) => event.preventDefault()}
          />
        </div>
        <button
          type="button"
          aria-label="Download image"
          title="Download"
          disabled={saving}
          onClick={() => {
            setSaving(true);
            setSaveNote(null);
            void saveGeneratedImage({ url: block.url, name: block.name })
              .then((res) => {
                if (!res.ok) {
                  setSaveNote(res.error || "Couldn’t save");
                  return;
                }
                if (res.method === "photos") setSaveNote("Saved to Photos");
              })
              .finally(() => setSaving(false));
          }}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center self-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </div>
      {saveNote ? (
        <p className="text-right text-[11px] text-muted-foreground" role="status">
          {saveNote}
        </p>
      ) : null}
    </div>
  );
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

  if (block.status === "completed" && block.imageUrl) {
    return (
      <GeneratedImageBlock
        block={{
          type: "image",
          url: block.imageUrl,
          name: block.name || "generated.png",
          mime: block.mime,
          attachmentId: block.attachmentId,
          openaiFileId: block.openaiFileId,
        }}
      />
    );
  }

  if (block.status === "generating") {
    return (
      <div className="my-1 flex max-w-md flex-col gap-2">
        <div
          className="image-gen-placeholder aspect-square min-w-0 w-full overflow-hidden rounded-[14px] border border-border"
          aria-label="Generating image"
          role="status"
        />
      </div>
    );
  }

  if (block.status === "cancelled") {
    return (
      <div className="my-1 max-w-md rounded-[14px] border border-border bg-muted/20 px-3 py-3 text-[13px] text-muted-foreground">
        Image generation cancelled.
      </div>
    );
  }

  return (
    <div className="my-1 flex max-w-md items-center gap-3 rounded-[14px] border border-border bg-muted/20 px-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-medium">Image generation failed</p>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          {block.error || "Something went wrong."}
        </p>
      </div>
      {threadId && messageId ? (
        <button
          type="button"
          aria-label="Retry"
          title="Retry"
          disabled={retrying}
          onClick={() => {
            setRetrying(true);
            retryImageGeneration(
              block.generationId,
              threadId,
              messageId,
              block.prompt,
            );
            setRetrying(false);
          }}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      ) : null}
    </div>
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
