/**
 * Listen for share-in deep links (cander://share) and Capacitor App URL opens.
 * Always creates pending composer input — never auto-sends.
 */

"use client";

import { useEffect } from "react";
import {
  parseShareDeepLink,
  setComposerPendingInput,
} from "@/lib/composer-seed";

export function ShareInListener() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const ingest = (url: string) => {
      const pending = parseShareDeepLink(url);
      if (!pending) return;
      setComposerPendingInput(pending);
    };

    // Cold start / query
    try {
      if (window.location.search.includes("share=") || window.location.pathname.includes("/share")) {
        ingest(window.location.href);
      }
      if (window.location.hash.startsWith("#share")) {
        ingest(`cander://share?${window.location.hash.slice(1)}`);
      }
    } catch {
      // ignore
    }

    const onMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if ((data as { type?: string }).type === "cander:share") {
        const payload = data as {
          text?: string;
          url?: string;
          image?: string;
        };
        setComposerPendingInput({
          text: [payload.text, payload.url].filter(Boolean).join("\n") || undefined,
          attachments: payload.image?.startsWith("data:image/")
            ? [
                {
                  id: `share_${Math.random().toString(36).slice(2, 8)}`,
                  type: "image",
                  filename: "shared.jpeg",
                  mimeType: "image/jpeg",
                  size: Math.floor(payload.image.length * 0.75),
                  dataUrl: payload.image,
                },
              ]
            : undefined,
          source: "share",
        });
      }
    };
    window.addEventListener("message", onMessage);

    // Capacitor App plugin (optional)
    try {
      const cap = (
        window as Window & {
          Capacitor?: {
            Plugins?: {
              App?: {
                addListener?: (
                  event: string,
                  cb: (data: { url: string }) => void,
                ) => { remove: () => void };
              };
            };
          };
        }
      ).Capacitor;
      const sub = cap?.Plugins?.App?.addListener?.("appUrlOpen", (data) => {
        if (data?.url) ingest(data.url);
      });
      return () => {
        window.removeEventListener("message", onMessage);
        sub?.remove?.();
      };
    } catch {
      // fall through
    }

    return () => window.removeEventListener("message", onMessage);
  }, []);

  return null;
}
