"use client";

import { useState } from "react";
import { Globe } from "lucide-react";
import { faviconUrlForSite, isGoogleUrl } from "@/lib/preview-url";
import { cn } from "@/lib/utils";

export function FaviconImage({
  url,
  faviconUrl,
  className,
  size = 14,
}: {
  url?: string;
  faviconUrl?: string | null;
  className?: string;
  size?: number;
}) {
  const fallbackSrc =
    url && url !== "about:blank" ? faviconUrlForSite(url, size * 2) : null;
  const src = faviconUrl ?? fallbackSrc;
  const [broken, setBroken] = useState(false);

  if (url && isGoogleUrl(url)) {
    return (
      <span
        aria-hidden
        className={cn(
          "inline-flex shrink-0 items-center justify-center font-medium leading-none",
          className,
        )}
        style={{ width: size, height: size, fontSize: size - 2 }}
      >
        <span className="bg-gradient-to-br from-[#4285F4] via-[#34A853] to-[#EA4335] bg-clip-text text-transparent">
          G
        </span>
      </span>
    );
  }

  if (src && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className={cn("shrink-0 rounded-[3px] object-contain", className)}
        style={{ width: size, height: size }}
        onError={() => setBroken(true)}
      />
    );
  }

  return (
    <Globe
      className={cn("shrink-0 text-muted-foreground", className)}
      style={{ width: size, height: size }}
      strokeWidth={1.6}
    />
  );
}
