"use client";

/** Same-browser handoff when OAuth finishes in a popup/tab without the app session. */
export const OAUTH_HANDOFF_CHANNEL = "cander-connector-oauth";
export const OAUTH_HANDOFF_MESSAGE = "cander-oauth-session" as const;
export const OAUTH_HANDOFF_STORAGE_KEY = "cander:oauth:pending-session";

export type OAuthHandoffPayload = {
  type: typeof OAUTH_HANDOFF_MESSAGE;
  sessionUri: string;
  connectorId?: string | null;
};

export function publishOAuthHandoff(payload: {
  sessionUri: string;
  connectorId?: string | null;
}) {
  if (typeof window === "undefined") return;
  const message: OAuthHandoffPayload = {
    type: OAUTH_HANDOFF_MESSAGE,
    sessionUri: payload.sessionUri,
    connectorId: payload.connectorId ?? null,
  };

  try {
    window.opener?.postMessage(message, window.location.origin);
  } catch {
    // cross-origin opener
  }

  try {
    const channel = new BroadcastChannel(OAUTH_HANDOFF_CHANNEL);
    channel.postMessage(message);
    channel.close();
  } catch {
    // BroadcastChannel unavailable
  }

  try {
    localStorage.setItem(
      OAUTH_HANDOFF_STORAGE_KEY,
      JSON.stringify({ ...message, at: Date.now() }),
    );
  } catch {
    // private mode / blocked
  }
}

export function oauthReturnPath(input: {
  sessionUri: string;
  connectorId?: string | null;
}): string {
  const url = new URL("/connectors/oauth/return", "https://cander.app");
  url.searchParams.set("session_uri", input.sessionUri);
  if (input.connectorId) {
    url.searchParams.set("connector", input.connectorId);
  }
  return `${url.pathname}${url.search}`;
}
