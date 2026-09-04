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
  const [height, setHeight] = useState(0);
  const srcDoc = useMemo(() => buildMailSrcDoc(html), [html]);

  useEffect(() => {
    setHeight(0);
  }, [srcDoc]);

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
        // Exact content height — extra padding showed as a white strip under every mail.
        setHeight(Math.min(Math.max(Math.ceil(payload.height), 1), 8000));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onOpenLink]);

  return (
    <div className={cn("w-full overflow-hidden", className)}>
      <iframe
        ref={iframeRef}
        title="Email message"
        sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        srcDoc={srcDoc}
        className="block w-full border-0 bg-transparent"
        style={{ height: height || undefined, minHeight: height ? undefined : 1 }}
      />
    </div>
  );
}
