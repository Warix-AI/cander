"use client";

import { useMemo } from "react";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

const URL_RE = /https?:\/\/[^\s<>"'`)\]]+/gi;

function shortenUrl(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    const clipped =
      path.length > 28 ? `${path.slice(0, 24)}…` : path;
    return `${host}${clipped}`;
  } catch {
    return url.length > 42 ? `${url.slice(0, 39)}…` : url;
  }
}

function stripTrackingNoise(url: string) {
  try {
    const parsed = new URL(url);
    // Drop common tracking params for display; keep href intact.
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
  className,
}: {
  text: string;
  onOpenLink?: (url: string) => void;
  className?: string;
}) {
  const { prose, links } = useMemo(
    () => collapseLinkHeavyBlocks(text || ""),
    [text],
  );
  const segments = useMemo(() => segmentBody(prose), [prose]);

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
                className="mx-0.5 inline-flex max-w-full items-center gap-1 rounded-md bg-sky-500/10 px-1.5 py-0.5 align-baseline text-[12.5px] font-medium text-sky-700 underline-offset-2 hover:bg-sky-500/15 hover:underline dark:text-sky-300"
                title={segment.href}
              >
                <ExternalLink className="h-3 w-3 shrink-0 opacity-70" />
                <span className="truncate">{segment.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {links.length ? (
        <div className="rounded-[10px] border border-border/80 bg-muted/30 p-3">
          <p className="mb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Links · {links.length}
          </p>
          <ul className="space-y-1.5">
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
        </div>
      ) : null}
    </div>
  );
}
