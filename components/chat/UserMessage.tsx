"use client";

import type { ChatBlock } from "@/lib/types";

export function UserMessage({
  content,
  blocks,
}: {
  content: string;
  blocks?: ChatBlock[];
}) {
  const images = blocks?.filter((b) => b.type === "image") ?? [];
  return (
    <div className="max-w-[min(78%,36rem)] space-y-2">
      {images.length ? (
        <div className="flex flex-wrap justify-end gap-2">
          {images.map((image, index) => (
            <a
              key={`${image.name}-${index}`}
              href={image.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block overflow-hidden rounded-2xl border border-border bg-muted"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.url}
                alt={image.name}
                className="max-h-56 max-w-full object-contain"
              />
            </a>
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
    </div>
  );
}
