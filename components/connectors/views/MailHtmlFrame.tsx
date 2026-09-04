"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildMailSrcDoc } from "@/lib/mail-html";
import { cn } from "@/lib/utils";

/**
 * Renders HTML email bodies (images, tables, layout) in a sandboxed iframe.
 * Link clicks are forwarded to the host via postMessage.
 */
export function MailHtmlFrame({
  html,
  onOpenLink,
  className,
}: {
  html: string;
  onOpenLink?: (url: string) => void;
  className?: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState(280);
  const srcDoc = useMemo(() => buildMailSrcDoc(html), [html]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data;
      if (!data || typeof data !== "object") return;
      const payload = data as { type?: string; href?: string; height?: number };
      if (payload.type === "cander-mail-link" && typeof payload.href === "string") {
        onOpenLink?.(payload.href);
      }
      if (
        payload.type === "cander-mail-height" &&
        typeof payload.height === "number" &&
        Number.isFinite(payload.height)
      ) {
        setHeight(Math.min(Math.max(Math.ceil(payload.height) + 8, 120), 6000));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onOpenLink]);

  return (
    <iframe
      ref={iframeRef}
      title="Email message"
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      srcDoc={srcDoc}
      className={cn("block w-full border-0 bg-white", className)}
      style={{ height }}
    />
  );
}
