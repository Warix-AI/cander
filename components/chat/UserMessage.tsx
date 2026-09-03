"use client";

import { FileText } from "lucide-react";
import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import { connectors } from "@/lib/data";
import type { ChatBlock } from "@/lib/types";
import { formatClarificationAnswersForDisplay } from "@/lib/ai/clarification/schema";

function fileExtension(name: string) {
  const part = name.split(".").pop()?.trim();
  return part && part !== name ? part.slice(0, 4).toUpperCase() : "FILE";
}

type UserConnector = Extract<ChatBlock, { type: "user_connector" }>;

function splitContentWithConnectors(
  content: string,
  items: UserConnector[],
): Array<{ kind: "text"; text: string } | { kind: "connector"; item: UserConnector }> {
  if (!content || !items.length) return [{ kind: "text", text: content }];

  // Longest labels first so "Google Calendar" wins over "Calendar".
  const ordered = [...items].sort(
    (a, b) => b.label.length - a.label.length || a.label.localeCompare(b.label),
  );
  const escape = (value: string) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `(${ordered.map((item) => escape(item.label)).join("|")})`,
    "gi",
  );
  const parts: Array<
    { kind: "text"; text: string } | { kind: "connector"; item: UserConnector }
  > = [];
  let last = 0;
  let match: RegExpExecArray | null;
  const used = new Set<string>();
  while ((match = pattern.exec(content))) {
    const start = match.index;
    if (start > last) {
      parts.push({ kind: "text", text: content.slice(last, start) });
    }
    const hit = match[1] ?? "";
    const item =
      ordered.find(
        (c) =>
          c.label.toLowerCase() === hit.toLowerCase() &&
          !used.has(c.connectionId),
      ) ??
      ordered.find((c) => c.label.toLowerCase() === hit.toLowerCase());
    if (item) {
      used.add(item.connectionId);
      parts.push({ kind: "connector", item });
    } else {
      parts.push({ kind: "text", text: hit });
    }
    last = start + hit.length;
  }
  if (last < content.length) {
    parts.push({ kind: "text", text: content.slice(last) });
  }
  return parts.length ? parts : [{ kind: "text", text: content }];
}

function InlineConnectorChip({ item }: { item: UserConnector }) {
  const iconId =
    connectors.find((c) => c.id === item.connectorId)?.icon ?? item.connectorId;
  return (
    <span className="mx-[0.05em] text-[1em] leading-[inherit] text-sky-500/95 dark:text-sky-400/95">
      <ConnectorMark
        id={iconId}
        size="nav"
        // Letter-sized glyph on the text baseline (no flex centering).
        className="!mr-[0.15em] !inline-block !h-[0.7em] !w-[0.7em] !align-[-0.05em]"
      />
      <span className="font-medium">{item.label}</span>
    </span>
  );
}

export function UserMessage({
  content,
  blocks,
}: {
  content: string;
  blocks?: ChatBlock[];
}) {
  const images = blocks?.filter((b) => b.type === "image") ?? [];
  const files = blocks?.filter((b) => b.type === "file") ?? [];
  const userConnectors =
    blocks?.filter((b): b is UserConnector => b.type === "user_connector") ??
    [];
  const parts = splitContentWithConnectors(content, userConnectors);

  return (
    <div className="max-w-[min(78%,36rem)] space-y-2">
      {images.length || files.length ? (
        <div className="flex flex-wrap justify-end gap-1.5">
          {images.map((image, index) =>
            image.url ? (
              <a
                key={`${image.name}-${index}`}
                href={image.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block h-10 w-10 overflow-hidden rounded-[10px] border border-border bg-muted"
                title={image.name}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.url}
                  alt={image.name}
                  className="h-full w-full object-cover"
                />
              </a>
            ) : (
              <div
                key={`${image.name}-${index}`}
                title={image.name}
                className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-border bg-muted text-[9px] text-muted-foreground"
              >
                IMG
              </div>
            ),
          )}
          {files.map((file, index) => (
            <div
              key={`${file.name}-${index}`}
              title={file.name}
              className="relative flex h-10 w-10 flex-col items-center justify-center overflow-hidden rounded-[10px] border border-border bg-muted"
            >
              <FileText
                className="h-4 w-4 text-muted-foreground"
                strokeWidth={1.7}
              />
              <span className="mt-0.5 font-mono text-[8px] leading-none text-muted-foreground">
                {fileExtension(file.name)}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {content ? (
        <div className="light-surface rounded-2xl px-3.5 py-2.5">
          <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed tracking-[-0.01em]">
            {parts.map((part, index) =>
              part.kind === "text" ? (
                <span key={`t-${index}`}>{part.text}</span>
              ) : (
                <InlineConnectorChip
                  key={`c-${part.item.connectionId}-${index}`}
                  item={part.item}
                />
              ),
            )}
          </p>
        </div>
      ) : null}
      {blocks
        ?.filter((b) => b.type === "clarification")
        .map((block, index) => (
          <div
            key={`clarify-${index}`}
            className="rounded-[10px] border border-border/80 bg-background/80 px-3 py-2 text-[13px]"
          >
            <p className="font-medium">{block.title}</p>
            <ul className="mt-1 space-y-0.5 text-muted-foreground">
              {formatClarificationAnswersForDisplay(block.answers).map(
                (row) => (
                  <li key={`${row.label}-${row.value}`}>
                    {row.label}: {row.value}
                  </li>
                ),
              )}
            </ul>
          </div>
        ))}
    </div>
  );
}
