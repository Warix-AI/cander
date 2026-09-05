"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

const AVATAR_COLORS = [
  "#7986CB",
  "#4DB6AC",
  "#81C784",
  "#FFB74D",
  "#E57373",
  "#BA68C8",
  "#64B5F6",
  "#A1887F",
  "#F06292",
  "#4DD0E1",
] as const;

/** Domains where a favicon is usually just a mail logo, not a brand mark. */
const PERSONAL_MAIL_HOSTS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "fastmail.com",
  "hey.com",
]);

/** Common ESP / marketing subdomains in From: addresses. */
const STRIP_LABELS = new Set([
  "mail",
  "email",
  "emails",
  "e",
  "em",
  "m",
  "mg",
  "send",
  "sender",
  "bounce",
  "news",
  "newsletter",
  "notify",
  "notification",
  "notifications",
  "updates",
  "info",
  "support",
  "hello",
  "go",
  "click",
  "links",
  "reply",
  "replies",
]);

function hashHue(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]!;
}

function senderLabel(fromAddr: string | null | undefined) {
  if (!fromAddr) return "Unknown";
  const match = fromAddr.match(/^"?([^"<]+)"?\s*</);
  return (match?.[1] ?? fromAddr).trim() || "Unknown";
}

function senderEmail(fromAddr: string | null | undefined) {
  if (!fromAddr) return "";
  const match = fromAddr.match(/<([^>]+)>/);
  return (match?.[1] ?? fromAddr).trim().toLowerCase();
}

function senderHost(email: string) {
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  const host = email.slice(at + 1).trim().toLowerCase();
  return host || null;
}

/** Prefer the registrable brand host (linkedin.com from mail.linkedin.com). */
function brandDomain(host: string): string {
  const parts = host.split(".").filter(Boolean);
  while (parts.length > 2 && STRIP_LABELS.has(parts[0]!)) {
    parts.shift();
  }
  // keep foo.co.uk / foo.com.au style
  if (
    parts.length >= 3 &&
    parts[parts.length - 1]!.length === 2 &&
    ["co", "com", "org", "net", "ac", "gov"].includes(parts[parts.length - 2]!)
  ) {
    return parts.slice(-3).join(".");
  }
  if (parts.length >= 2) return parts.slice(-2).join(".");
  return parts.join(".");
}

function shouldTryFavicon(domain: string | null) {
  if (!domain) return false;
  if (PERSONAL_MAIL_HOSTS.has(domain)) return false;
  if (!domain.includes(".")) return false;
  return true;
}

/** High-res enough for retina 36px circles. Google often ignores small sz=. */
function brandIconUrls(domain: string): string[] {
  const d = encodeURIComponent(domain);
  return [
    `https://www.google.com/s2/favicons?domain=${d}&sz=128`,
    `https://icons.duckduckgo.com/ip3/${d}.ico`,
  ];
}

export function MailSenderAvatar({
  fromAddr,
  size = 36,
  className,
}: {
  fromAddr: string | null | undefined;
  size?: number;
  className?: string;
}) {
  const label = senderLabel(fromAddr);
  const email = senderEmail(fromAddr);
  const host = senderHost(email);
  const domain = host ? brandDomain(host) : null;
  const letter = (label.slice(0, 1) || "?").toUpperCase();
  const color = hashHue(email || label);
  const sources = useMemo(
    () => (shouldTryFavicon(domain) && domain ? brandIconUrls(domain) : []),
    [domain],
  );
  const [sourceIndex, setSourceIndex] = useState(0);
  const [useLetter, setUseLetter] = useState(sources.length === 0);

  useEffect(() => {
    setSourceIndex(0);
    setUseLetter(sources.length === 0);
  }, [domain, sources.length]);

  const src = !useLetter ? sources[sourceIndex] : undefined;
  const iconPx = Math.round(size * 0.72);

  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full",
        className,
      )}
      style={{
        width: size,
        height: size,
        backgroundColor: useLetter ? color : "#F1F3F4",
      }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt=""
          width={iconPx}
          height={iconPx}
          decoding="async"
          className="object-contain"
          style={{ width: iconPx, height: iconPx }}
          onLoad={(event) => {
            const img = event.currentTarget;
            // Google's "missing" globe (and many tiny icos) are ≤16px — skip them.
            if (img.naturalWidth > 0 && img.naturalWidth < 32) {
              if (sourceIndex + 1 < sources.length) {
                setSourceIndex((i) => i + 1);
              } else {
                setUseLetter(true);
              }
            }
          }}
          onError={() => {
            if (sourceIndex + 1 < sources.length) {
              setSourceIndex((i) => i + 1);
            } else {
              setUseLetter(true);
            }
          }}
        />
      ) : (
        <span
          className="font-semibold leading-none text-white"
          style={{ fontSize: Math.max(11, Math.round(size * 0.38)) }}
        >
          {letter}
        </span>
      )}
    </span>
  );
}
