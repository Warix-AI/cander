"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

export function CodeBlock({
  code,
  language,
}: {
  code: string;
  language?: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="group relative my-2 max-w-full overflow-hidden rounded-[10px] border border-border bg-muted/60">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
          {language || "code"}
        </span>
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
          aria-label={copied ? "Copied" : "Copy code"}
        >
          {copied ? (
            <Check className="h-3 w-3" strokeWidth={1.8} />
          ) : (
            <Copy className="h-3 w-3" strokeWidth={1.6} />
          )}
        </button>
      </div>
      <pre
        className={cn(
          "overflow-x-auto px-3 py-2.5 font-mono text-[12.5px] leading-relaxed text-foreground",
          "[scrollbar-width:thin]",
        )}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}
