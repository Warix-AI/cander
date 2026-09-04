"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ExternalLink, Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";

const URL_RE = /https?:\/\/[^\s<>"'`)\]]+/gi;

function shortenUrl(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    const clipped = path.length > 28 ? `${path.slice(0, 24)}…` : path;
    return `${host}${clipped}`;
  } catch {
    return url.length > 42 ? `${url.slice(0, 39)}…` : url;
  }
}

function stripTrackingNoise(url: string) {
  try {
    const parsed = new URL(url);
    const drop = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "fbclid",
      "gclid",
    ];
    for (const key of drop) parsed.searchParams.delete(key);
    return parsed.toString();
  } catch {
    return url;
  }
}

type Segment =
  | { type: "text"; value: string }
  | { type: "link"; href: string; label: string };

function segmentBody(text: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  const re = new RegExp(URL_RE);
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    if (match.index > last) {
      segments.push({ type: "text", value: text.slice(last, match.index) });
    }
    const raw = match[0].replace(/[.,;:!?)]+$/, "");
    segments.push({
      type: "link",
      href: raw,
      label: shortenUrl(stripTrackingNoise(raw)),
    });
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    segments.push({ type: "text", value: text.slice(last) });
  }
  return segments;
}

/** Collapse runs of mostly-link paragraphs into a compact link list. */
function collapseLinkHeavyBlocks(text: string): {
  prose: string;
  links: string[];
} {
  const lines = text.split(/\n+/);
  const proseLines: string[] = [];
  const links: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      proseLines.push("");
      continue;
    }
    const urls = trimmed.match(URL_RE) ?? [];
    const withoutUrls = trimmed.replace(URL_RE, "").trim();
    const mostlyLinks =
      urls.length > 0 &&
      (withoutUrls.length < 24 || urls.join("").length > trimmed.length * 0.55);
    if (mostlyLinks) {
      for (const url of urls) {
        const clean = url.replace(/[.,;:!?)]+$/, "");
        if (!links.includes(clean)) links.push(clean);
      }
      continue;
    }
    proseLines.push(line);
  }
  return {
    prose: proseLines.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
    links,
  };
}

export function MailBody({
  text,
  onOpenLink,
  hasAttachments,
  className,
}: {
  text: string;
  onOpenLink?: (url: string) => void;
  hasAttachments?: boolean;
  className?: string;
}) {
  const { prose, links } = useMemo(
    () => collapseLinkHeavyBlocks(text || ""),
    [text],
  );
  const segments = useMemo(() => segmentBody(prose), [prose]);
  const [linksOpen, setLinksOpen] = useState(false);

  if (!text.trim()) {
    return (
      <p className="text-[13.5px] text-muted-foreground">No message body.</p>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {prose ? (
        <div className="whitespace-pre-wrap text-[14px] leading-[1.55] text-foreground/95">
          {segments.map((segment, index) => {
            if (segment.type === "text") {
              return <span key={`t-${index}`}>{segment.value}</span>;
            }
            return (
              <button
                key={`l-${index}`}
                type="button"
                onClick={() => onOpenLink?.(segment.href)}
                className="mx-0.5 inline font-medium text-sky-700 underline underline-offset-2 hover:text-sky-800 dark:text-sky-300 dark:hover:text-sky-200"
                title={segment.href}
              >
                {segment.label}
              </button>
            );
          })}
        </div>
      ) : null}

      {hasAttachments ? (
        <div className="flex items-center gap-2 rounded-[10px] border border-border/70 bg-muted/20 px-3 py-2.5 text-[12.5px] text-muted-foreground">
          <Paperclip className="h-3.5 w-3.5 shrink-0" />
          <span>This message has attachments</span>
        </div>
      ) : null}

      {links.length ? (
        <div className="rounded-[10px] border border-border/70 bg-muted/20">
          <button
            type="button"
            onClick={() => setLinksOpen((open) => !open)}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[12px] font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 shrink-0 transition-transform",
                linksOpen ? "rotate-0" : "-rotate-90",
              )}
              strokeWidth={1.8}
            />
            <span>
              Links · {links.length}
            </span>
          </button>
          {linksOpen ? (
            <ul className="space-y-0.5 border-t border-border/60 px-2 pb-2 pt-1">
              {links.map((href) => (
                <li key={href}>
                  <button
                    type="button"
                    onClick={() => onOpenLink?.(href)}
                    className="group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] text-sky-700 transition-colors hover:bg-background dark:text-sky-300"
                    title={href}
                  >
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-60 group-hover:opacity-100" />
                    <span className="min-w-0 truncate font-medium">
                      {shortenUrl(stripTrackingNoise(href))}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
