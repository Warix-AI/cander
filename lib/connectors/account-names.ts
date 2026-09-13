/**
 * Candor display-name rules for multi-account connectors (pure / testable).
 */

export const MAX_CONNECTOR_ACCOUNTS_PER_CONNECTOR = 3;
export const CONNECTOR_DISPLAY_NAME_MIN = 1;
export const CONNECTOR_DISPLAY_NAME_MAX = 10;

export type DisplayNameValidation =
  | { ok: true; value: string }
  | { ok: false; error: string };

/** Trim and validate length. Does not check uniqueness. */
export function normalizeConnectorDisplayName(
  raw: string | null | undefined,
): DisplayNameValidation {
  const value = String(raw ?? "").trim();
  if (value.length < CONNECTOR_DISPLAY_NAME_MIN) {
    return {
      ok: false,
      error: "Account name is required (1–10 characters).",
    };
  }
  if (value.length > CONNECTOR_DISPLAY_NAME_MAX) {
    return {
      ok: false,
      error: "Account name must be 10 characters or fewer.",
    };
  }
  return { ok: true, value };
}

export function displayNamesEqual(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  return String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
}

export function isDisplayNameTaken(opts: {
  candidate: string;
  existing: Array<{ displayName: string; id?: string }>;
  excludeId?: string | null;
}): boolean {
  const needle = opts.candidate.trim().toLowerCase();
  return opts.existing.some((row) => {
    if (opts.excludeId && row.id && row.id === opts.excludeId) return false;
    return row.displayName.trim().toLowerCase() === needle;
  });
}

export function validateUniqueConnectorDisplayName(opts: {
  raw: string | null | undefined;
  existing: Array<{ displayName: string; id?: string }>;
  excludeId?: string | null;
}): DisplayNameValidation {
  const normalized = normalizeConnectorDisplayName(opts.raw);
  if (!normalized.ok) return normalized;
  if (
    isDisplayNameTaken({
      candidate: normalized.value,
      existing: opts.existing,
      excludeId: opts.excludeId,
    })
  ) {
    return {
      ok: false,
      error: "That account name is already used for this app.",
    };
  }
  return normalized;
}

export function canAddAnotherConnectorAccount(
  liveCount: number,
  maxAccounts: number = MAX_CONNECTOR_ACCOUNTS_PER_CONNECTOR,
): boolean {
  const cap = Number.isFinite(maxAccounts)
    ? Math.max(1, Math.floor(maxAccounts))
    : MAX_CONNECTOR_ACCOUNTS_PER_CONNECTOR;
  return liveCount < cap;
}

export function connectorAccountLimitMessage(
  maxAccounts: number = MAX_CONNECTOR_ACCOUNTS_PER_CONNECTOR,
): string {
  const cap = Number.isFinite(maxAccounts)
    ? Math.max(1, Math.floor(maxAccounts))
    : MAX_CONNECTOR_ACCOUNTS_PER_CONNECTOR;
  if (cap <= 1) {
    return "Minimal includes 1 account per app. Upgrade to connect more.";
  }
  return `You can connect up to ${cap} accounts for this app.`;
}

/** Default backfill label for migrated singles — treat as unnamed in the UI. */
export const CONNECTOR_DEFAULT_DISPLAY_NAME = "Account";

export function connectorAccountNeedsRename(
  displayName: string | null | undefined,
): boolean {
  const name = String(displayName ?? "").trim();
  return !name || name.toLowerCase() === CONNECTOR_DEFAULT_DISPLAY_NAME.toLowerCase();
}

/** Nav tab label — unnamed / default accounts show “Rename”. */
export function connectorAccountNavLabel(
  displayName: string | null | undefined,
): string {
  if (connectorAccountNeedsRename(displayName)) return "Rename";
  return String(displayName).trim();
}

/**
 * Connector browser tab title for a connected account.
 * Named accounts use the display name; unnamed fall back to the connector label.
 * Sidebar pins keep the connector product name — do not use this for nav pins.
 */
export function connectorAccountTabLabel(
  displayName: string | null | undefined,
  fallback: string,
): string {
  if (connectorAccountNeedsRename(displayName)) return fallback;
  return String(displayName).trim();
}
