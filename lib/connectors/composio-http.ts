/**
 * Server-only Composio REST client (v3.1) — no browser imports.
 */

const COMPOSIO_API_BASE = "https://backend.composio.dev/api/v3.1";

export function isComposioConfigured(): boolean {
  return Boolean(
    process.env.COMPOSIO_API_KEY?.trim() &&
      process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID?.trim(),
  );
}

function apiKey(): string {
  const key = process.env.COMPOSIO_API_KEY?.trim();
  if (!key) throw new Error("COMPOSIO_API_KEY is not configured");
  return key;
}

function gmailAuthConfigId(): string {
  const id = process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID?.trim();
  if (!id) throw new Error("COMPOSIO_GMAIL_AUTH_CONFIG_ID is not configured");
  return id;
}

export type ComposioLinkSession = {
  redirectUrl: string;
  connectedAccountId: string;
  linkToken: string;
  expiresAt: string;
};

export async function createConnectLink(input: {
  composioUserId: string;
  connectorId: string;
}): Promise<ComposioLinkSession> {
  if (input.connectorId !== "gmail") {
    throw new Error("Only Gmail is enabled for the Composio pilot");
  }
  const res = await fetch(`${COMPOSIO_API_BASE}/connected_accounts/link`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey(),
    },
    body: JSON.stringify({
      user_id: input.composioUserId,
      auth_config_id: gmailAuthConfigId(),
      allow_multiple: false,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Composio link failed (${res.status})`);
  }
  const json = (await res.json()) as {
    redirect_url?: string;
    connected_account_id?: string;
    link_token?: string;
    expires_at?: string;
  };
  if (!json.redirect_url || !json.connected_account_id) {
    throw new Error("Composio link response incomplete");
  }
  return {
    redirectUrl: json.redirect_url,
    connectedAccountId: json.connected_account_id,
    linkToken: json.link_token ?? json.connected_account_id,
    expiresAt: json.expires_at ?? new Date(Date.now() + 600_000).toISOString(),
  };
}

export type ComposioCompleteAuthResult = {
  connectedAccountId: string;
  toolkitSlug: string;
  status: string;
};

export async function completeComposioAuth(input: {
  sessionUri: string;
  composioUserId: string;
}): Promise<ComposioCompleteAuthResult> {
  const res = await fetch(`${COMPOSIO_API_BASE}/connected_accounts/complete_auth`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey(),
    },
    body: JSON.stringify({
      session_uri: input.sessionUri,
      user_id: input.composioUserId,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Composio complete_auth failed (${res.status})`);
  }
  const json = (await res.json()) as {
    connected_account_id?: string;
    toolkit_slug?: string;
    status?: string;
  };
  if (!json.connected_account_id) {
    throw new Error("Composio complete_auth response incomplete");
  }
  return {
    connectedAccountId: json.connected_account_id,
    toolkitSlug: json.toolkit_slug ?? "gmail",
    status: json.status ?? "ACTIVE",
  };
}

export async function getComposioConnectedAccount(
  connectedAccountId: string,
): Promise<{ status: string; toolkitSlug?: string }> {
  const res = await fetch(
    `${COMPOSIO_API_BASE}/connected_accounts/${encodeURIComponent(connectedAccountId)}`,
    {
      headers: { "x-api-key": apiKey() },
    },
  );
  if (!res.ok) {
    throw new Error(`Composio get account failed (${res.status})`);
  }
  const json = (await res.json()) as {
    status?: string;
    toolkit?: { slug?: string };
  };
  return {
    status: json.status ?? "UNKNOWN",
    toolkitSlug: json.toolkit?.slug,
  };
}

export async function revokeComposioConnectedAccount(
  connectedAccountId: string,
): Promise<{ ok: boolean }> {
  const res = await fetch(
    `${COMPOSIO_API_BASE}/connected_accounts/${encodeURIComponent(connectedAccountId)}/revoke`,
    {
      method: "POST",
      headers: { "x-api-key": apiKey() },
    },
  );
  if (!res.ok) {
    return { ok: false };
  }
  return { ok: true };
}

export function composioWebhookSecret(): string | null {
  return process.env.COMPOSIO_WEBHOOK_SECRET?.trim() || null;
}

export function composioCallbackVerifierPath(): string {
  return "/api/connectors/oauth/verify";
}

export function allowedPostVerifyRedirectPaths(): string[] {
  return ["/", "/work", "/spaces"];
}
