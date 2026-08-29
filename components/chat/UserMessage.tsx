"use client";

import { FileText } from "lucide-react";
import type { ChatBlock } from "@/lib/types";
import { formatClarificationAnswersForDisplay } from "@/lib/ai/clarification/schema";

function fileExtension(name: string) {
  const part = name.split(".").pop()?.trim();
  return part && part !== name ? part.slice(0, 4).toUpperCase() : "FILE";
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
  return (
    <div className="max-w-[min(78%,36rem)] space-y-2">
      {images.length || files.length ? (
        <div className="flex flex-wrap justify-end gap-1.5">
          {images.map((image, index) => (
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
          ))}
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
        <div className="rounded-2xl bg-muted px-3.5 py-2.5">
          <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed tracking-[-0.01em]">
            {content}
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
