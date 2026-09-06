"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

const AVATAR_COLORS = [
  "#635BFF",
  "#0A2540",
  "#00D4FF",
  "#7986CB",
  "#4DB6AC",
  "#81C784",
  "#FFB74D",
  "#E57373",
  "#BA68C8",
  "#64B5F6",
] as const;

function hashHue(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]!;
}

function initialLetter(label: string) {
  const trimmed = label.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return trimmed.slice(0, 1).toUpperCase();
}

async function sha256Hex(value: string) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Stripe list/detail thumbnail: product images, metadata photos, or Gravatar
 * from customer email. Falls back to initials.
 */
export function StripeEntityAvatar({
  title,
  email,
  imageUrl,
  size = 28,
  className,
  rounded = "full",
}: {
  title: string;
  email?: string | null;
  imageUrl?: string | null;
  size?: number;
  className?: string;
  /** Products look better slightly squared; customers as circles. */
  rounded?: "full" | "soft";
}) {
  const letter = initialLetter(title);
  const color = hashHue((email || title).toLowerCase());
  const radius =
    rounded === "full" ? size / 2 : Math.max(8, Math.round(size * 0.28));

  const [gravatarUrl, setGravatarUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    setGravatarUrl(null);
    const normalized = email?.trim().toLowerCase();
    if (!normalized || !normalized.includes("@")) return;
    let cancelled = false;
    void sha256Hex(normalized).then((hash) => {
      if (cancelled) return;
      // d=404 so missing profiles fall through to initials instead of a mystery-person.
      setGravatarUrl(
        `https://www.gravatar.com/avatar/${hash}?s=${Math.min(256, size * 4)}&d=404`,
      );
    });
    return () => {
      cancelled = true;
    };
  }, [email, size]);

  const sources = useMemo(() => {
    const out: string[] = [];
    if (imageUrl && /^https?:\/\//i.test(imageUrl)) out.push(imageUrl);
    if (gravatarUrl) out.push(gravatarUrl);
    return out;
  }, [gravatarUrl, imageUrl]);

  const [sourceIndex, setSourceIndex] = useState(0);
  useEffect(() => {
    setSourceIndex(0);
    setFailed(false);
  }, [sources.join("|")]);

  const src = !failed ? sources[sourceIndex] : undefined;

  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden bg-muted",
        className,
      )}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: src ? undefined : color,
      }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt=""
          width={size}
          height={size}
          decoding="async"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
          onError={() => {
            if (sourceIndex + 1 < sources.length) {
              setSourceIndex((i) => i + 1);
            } else {
              setFailed(true);
            }
          }}
        />
      ) : (
        <span
          className="font-semibold leading-none text-white"
          style={{ fontSize: Math.max(10, Math.round(size * 0.36)) }}
        >
          {letter}
        </span>
      )}
    </span>
  );
}

export function emailFromStripeRaw(
  raw: Record<string, unknown> | null | undefined,
): string | undefined {
  if (!raw) return undefined;
  const email = raw.email;
  return typeof email === "string" && email.includes("@") ? email.trim() : undefined;
}
