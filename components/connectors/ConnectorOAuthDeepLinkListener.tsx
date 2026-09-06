"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  OAUTH_HANDOFF_CHANNEL,
  OAUTH_HANDOFF_MESSAGE,
  OAUTH_HANDOFF_STORAGE_KEY,
  oauthReturnPath,
  type OAuthHandoffPayload,
} from "@/lib/connectors/oauth-handoff";
import { isMobileShell } from "@/lib/mobile-shell";

function isHandoffPayload(data: unknown): data is OAuthHandoffPayload {
  if (!data || typeof data !== "object") return false;
  const row = data as Record<string, unknown>;
  return (
    row.type === OAUTH_HANDOFF_MESSAGE &&
    typeof row.sessionUri === "string" &&
    row.sessionUri.length > 0
  );
}

function routeForHandoff(
  router: ReturnType<typeof useRouter>,
  payload: OAuthHandoffPayload,
) {
  const path = oauthReturnPath({
    sessionUri: payload.sessionUri,
    connectorId:
      typeof payload.connectorId === "string" ? payload.connectorId : null,
  });
  router.replace(path);
}

/**
 * Completes connector OAuth when:
 * - OS opens cander://oauth/return?...
 * - Another tab/window publishes a session_uri handoff (Safari finish page)
 */
export function ConnectorOAuthDeepLinkListener() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleUrl = (raw: string) => {
      let parsed: URL;
      try {
        parsed = new URL(raw);
      } catch {
        return;
      }
      const isOAuthReturn =
        (parsed.protocol === "cander:" && parsed.hostname === "oauth") ||
        parsed.pathname.includes("/connectors/oauth/return");
      if (!isOAuthReturn) return;
      const sessionUri = parsed.searchParams.get("session_uri")?.trim();
      if (!sessionUri) return;
      const connector = parsed.searchParams.get("connector")?.trim();
      routeForHandoff(router, {
        type: OAUTH_HANDOFF_MESSAGE,
        sessionUri,
        connectorId: connector,
      });
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (!isHandoffPayload(event.data)) return;
      try {
        localStorage.removeItem(OAUTH_HANDOFF_STORAGE_KEY);
      } catch {
        // ignore
      }
      routeForHandoff(router, event.data);
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key !== OAUTH_HANDOFF_STORAGE_KEY || !event.newValue) return;
      try {
        const parsed = JSON.parse(event.newValue) as unknown;
        if (!isHandoffPayload(parsed)) return;
        localStorage.removeItem(OAUTH_HANDOFF_STORAGE_KEY);
        routeForHandoff(router, parsed);
      } catch {
        // ignore
      }
    };

    window.addEventListener("message", onMessage);
    window.addEventListener("storage", onStorage);

    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(OAUTH_HANDOFF_CHANNEL);
      channel.onmessage = (event) => {
        if (!isHandoffPayload(event.data)) return;
        try {
          localStorage.removeItem(OAUTH_HANDOFF_STORAGE_KEY);
        } catch {
          // ignore
        }
        routeForHandoff(router, event.data);
      };
    } catch {
      channel = null;
    }

    // Consume a handoff left by the external finish page in this profile.
    try {
      const raw = localStorage.getItem(OAUTH_HANDOFF_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (isHandoffPayload(parsed)) {
          localStorage.removeItem(OAUTH_HANDOFF_STORAGE_KEY);
          routeForHandoff(router, parsed);
        }
      }
    } catch {
      // ignore
    }

    let removeAppUrl: () => void = () => {};
    if (isMobileShell()) {
      const cap = (
        window as Window & {
          Capacitor?: {
            Plugins?: {
              App?: {
                addListener?: (
                  eventName: "appUrlOpen",
                  listenerFunc: (data: { url: string }) => void,
                ) => Promise<{ remove: () => void }> | { remove: () => void };
              };
            };
          };
        }
      ).Capacitor;
      const app = cap?.Plugins?.App;
      if (app?.addListener) {
        void Promise.resolve(
          app.addListener("appUrlOpen", (data) => {
            if (data?.url) handleUrl(data.url);
          }),
        ).then((handle) => {
          if (handle?.remove) removeAppUrl = () => handle.remove();
        });
      }
    }

    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("storage", onStorage);
      channel?.close();
      removeAppUrl();
    };
  }, [router]);

  return null;
}
