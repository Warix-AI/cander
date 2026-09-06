"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isMobileShell } from "@/lib/mobile-shell";

type CapAppPlugin = {
  addListener?: (
    eventName: "appUrlOpen",
    listenerFunc: (data: { url: string }) => void,
  ) => Promise<{ remove: () => void }> | { remove: () => void };
};

/**
 * Completes connector OAuth when the OS opens cander://oauth/return?...
 * after auth in SFSafariViewController / Chrome Custom Tabs.
 */
export function ConnectorOAuthDeepLinkListener() {
  const router = useRouter();

  useEffect(() => {
    if (!isMobileShell() || typeof window === "undefined") return;

    const handleUrl = (raw: string) => {
      let parsed: URL;
      try {
        parsed = new URL(raw);
      } catch {
        return;
      }
      const isOAuthReturn =
        (parsed.protocol === "cander:" && parsed.host === "oauth") ||
        parsed.pathname.includes("/connectors/oauth/return");
      if (!isOAuthReturn) return;
      const sessionUri = parsed.searchParams.get("session_uri")?.trim();
      if (!sessionUri) return;
      const connector = parsed.searchParams.get("connector")?.trim();
      const next = new URL("/connectors/oauth/return", window.location.origin);
      next.searchParams.set("session_uri", sessionUri);
      if (connector) next.searchParams.set("connector", connector);
      router.replace(`${next.pathname}${next.search}`);
    };

    const cap = (
      window as Window & {
        Capacitor?: { Plugins?: { App?: CapAppPlugin } };
      }
    ).Capacitor;
    const app = cap?.Plugins?.App;
    if (!app?.addListener) return;

    let remove: () => void = () => {};
    void Promise.resolve(
      app.addListener("appUrlOpen", (data) => {
        if (data?.url) handleUrl(data.url);
      }),
    ).then((handle) => {
      if (handle?.remove) remove = () => handle.remove();
    });

    return () => remove();
  }, [router]);

  return null;
}
