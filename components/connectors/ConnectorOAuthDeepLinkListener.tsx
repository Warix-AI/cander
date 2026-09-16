"use client";

import { useEffect } from "react";
import {
  OAUTH_HANDOFF_CHANNEL,
  OAUTH_HANDOFF_MESSAGE,
  OAUTH_HANDOFF_STORAGE_KEY,
  type OAuthHandoffPayload,
} from "@/lib/connectors/oauth-handoff";
import { claimConnectorOAuthSession } from "@/lib/api/connector-client";
import {
  patchConnectorConnectionForWorkspace,
  replaceConnectorConnectionsForWorkspace,
} from "@/lib/connector-connections-store";
import { fetchConnectorConnections } from "@/lib/api/connector-client";
import { isMobileShell } from "@/lib/mobile-shell";
import { getWorkspaceSnapshot } from "@/lib/session";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/data-backend";

function personalWorkspaceIdForUser(userId: string) {
  return `ws-${userId.replace(/-/g, "")}`;
}

function isHandoffPayload(data: unknown): data is OAuthHandoffPayload {
  if (!data || typeof data !== "object") return false;
  const row = data as Record<string, unknown>;
  return (
    row.type === OAUTH_HANDOFF_MESSAGE &&
    typeof row.sessionUri === "string" &&
    row.sessionUri.length > 0
  );
}

async function resolveWorkspaceId(): Promise<string | null> {
  const fromSession = getWorkspaceSnapshot()?.trim();
  if (fromSession) return fromSession;
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = createSupabaseBrowserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.id) return personalWorkspaceIdForUser(user.id);
  } catch {
    // ignore
  }
  return null;
}

/**
 * Finish a parked OAuth session in the signed-in Cander window.
 * Never navigates to `/connectors/oauth/return` — that page is for the
 * unsigned popup/tab and was causing a home ↔ return redirect loop.
 */
async function claimHandoffInPlace(_payload: OAuthHandoffPayload) {
  try {
    localStorage.removeItem(OAUTH_HANDOFF_STORAGE_KEY);
  } catch {
    // ignore
  }

  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) return;

  try {
    const claimed = await claimConnectorOAuthSession({ workspaceId });
    if (claimed.claimed && claimed.connection) {
      patchConnectorConnectionForWorkspace(workspaceId, claimed.connection);
      return;
    }
    const connections = await fetchConnectorConnections(workspaceId);
    replaceConnectorConnectionsForWorkspace(workspaceId, connections);
  } catch {
    // Non-fatal — Apps UI / onboarding poll will retry.
  }
}

/**
 * Completes connector OAuth when:
 * - OS opens cander://oauth/return?...
 * - Another tab/window publishes a session_uri handoff (Safari finish page)
 *
 * Web: always claim in-place. Do not router.replace to the return page.
 */
export function ConnectorOAuthDeepLinkListener() {
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
      void claimHandoffInPlace({
        type: OAUTH_HANDOFF_MESSAGE,
        sessionUri,
        connectorId: connector,
      });
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (!isHandoffPayload(event.data)) return;
      void claimHandoffInPlace(event.data);
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key !== OAUTH_HANDOFF_STORAGE_KEY || !event.newValue) return;
      try {
        const parsed = JSON.parse(event.newValue) as unknown;
        if (!isHandoffPayload(parsed)) return;
        void claimHandoffInPlace(parsed);
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
        void claimHandoffInPlace(event.data);
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
          void claimHandoffInPlace(parsed);
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
  }, []);

  return null;
}
