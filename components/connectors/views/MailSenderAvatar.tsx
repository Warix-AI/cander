"use client";

import { useState } from "react";
import { faviconUrlForSite } from "@/lib/preview-url";
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

function senderDomain(email: string) {
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  const host = email.slice(at + 1).trim().toLowerCase();
  return host || null;
}

function shouldTryFavicon(domain: string | null) {
  if (!domain) return false;
  if (PERSONAL_MAIL_HOSTS.has(domain)) return false;
  // Skip bare IP / invalid hosts
  if (!domain.includes(".")) return false;
  return true;
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
  const domain = senderDomain(email);
  const letter = (label.slice(0, 1) || "?").toUpperCase();
  const color = hashHue(email || label);
  const favicon =
    shouldTryFavicon(domain) && domain
      ? faviconUrlForSite(`https://${domain}`, Math.max(size * 2, 64))
      : null;
  const [broken, setBroken] = useState(false);
  const showFavicon = Boolean(favicon) && !broken;

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
        backgroundColor: showFavicon ? "#E8EAED" : color,
      }}
    >
      {showFavicon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={favicon!}
          alt=""
          width={Math.round(size * 0.58)}
          height={Math.round(size * 0.58)}
          className="object-contain"
          style={{
            width: Math.round(size * 0.58),
            height: Math.round(size * 0.58),
          }}
          onError={() => setBroken(true)}
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
