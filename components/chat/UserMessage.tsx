"use client";

export function UserMessage({ content }: { content: string }) {
  return (
    <div className="max-w-[min(78%,36rem)] rounded-2xl bg-muted px-3.5 py-2.5">
      <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed tracking-[-0.01em]">
        {content}
      </p>
    </div>
  );
}
