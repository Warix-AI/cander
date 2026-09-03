/**
 * Detect workspace connector mentions in composer text / dictation.
 * Matches product names + common aliases against connected apps only.
 */

import {
  connectorsFromBlocks,
  normalizeComposerBlocks,
  type ComposerBlock,
  type ComposerConnectorScope,
} from "./composer-blocks.ts";

export type ConnectorDetectCandidate = {
  connectionId: string;
  connectorId: string;
  label: string;
};

export type ConnectorMention = {
  connectionId: string;
  connectorId: string;
  label: string;
  /** Matched surface form as it appeared in text (for UI affordances). */
  matched: string;
};

/** Extra aliases beyond catalog `name` / `id`. Prefer product-specific terms. */
const CONNECTOR_ALIASES: Record<string, string[]> = {
  gmail: ["gmail", "google mail", "googlemail"],
  gcal: ["google calendar", "gcal", "g calendar"],
  gdrive: ["google drive", "gdrive", "g drive"],
  gsheets: ["google sheets", "gsheets", "g sheets"],
  outlook: ["outlook", "hotmail", "microsoft mail"],
  slack: ["slack"],
  notion: ["notion"],
  hubspot: ["hubspot", "hub spot"],
  github: ["github", "git hub"],
  teams: ["microsoft teams", "ms teams", "teams"],
  stripe: ["stripe"],
  shopify: ["shopify"],
  salesforce: ["salesforce", "sfdc"],
  linear: ["linear"],
  jira: ["jira"],
};

/**
 * Generic words that only match when exactly one mail connector is connected
 * (avoids Gmail vs Outlook ambiguity).
 */
const GENERIC_MAIL_ALIASES = ["email", "e-mail", "emails", "inbox", "mailbox"];
const MAIL_CONNECTOR_IDS = new Set(["gmail", "outlook"]);

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeTrigger(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Build unique triggers for a catalog connector (longest first for matching). */
export function triggersForConnector(
  connectorId: string,
  label: string,
): string[] {
  const raw = [label, connectorId, ...(CONNECTOR_ALIASES[connectorId] ?? [])]
    .map(normalizeTrigger)
    .filter(Boolean);
  return [...new Set(raw)].sort((a, b) => b.length - a.length);
}

function wordBoundaryPattern(trigger: string): RegExp {
  const parts = trigger.split(" ").map(escapeRegExp);
  const body = parts.join("\\s+");
  return new RegExp(
    `(?:^|[^\\p{L}\\p{N}_])(${body})(?=$|[^\\p{L}\\p{N}_])`,
    "iu",
  );
}

function firstMatchInText(text: string, trigger: string): string | null {
  if (!text || !trigger) return null;
  const re = wordBoundaryPattern(trigger);
  const hit = re.exec(text);
  return hit?.[1] ?? null;
}

/**
 * Return one mention per connector when a trigger appears in `text`.
 * Only considers the provided connected candidates.
 */
export function detectConnectorMentions(
  text: string,
  candidates: ConnectorDetectCandidate[],
): ConnectorMention[] {
  if (!text.trim() || !candidates.length) return [];

  const byConnector = new Map<string, ConnectorDetectCandidate>();
  for (const row of candidates) {
    if (!byConnector.has(row.connectorId)) byConnector.set(row.connectorId, row);
  }

  const found: ConnectorMention[] = [];
  const claimed = new Set<string>();

  for (const row of byConnector.values()) {
    const triggers = triggersForConnector(row.connectorId, row.label);
    for (const trigger of triggers) {
      const matched = firstMatchInText(text, trigger);
      if (!matched) continue;
      found.push({
        connectionId: row.connectionId,
        connectorId: row.connectorId,
        label: row.label,
        matched,
      });
      claimed.add(row.connectorId);
      break;
    }
  }

  const mailConnected = [...byConnector.values()].filter((c) =>
    MAIL_CONNECTOR_IDS.has(c.connectorId),
  );
  if (mailConnected.length === 1) {
    const only = mailConnected[0]!;
    if (!claimed.has(only.connectorId)) {
      for (const trigger of GENERIC_MAIL_ALIASES) {
        const matched = firstMatchInText(text, trigger);
        if (!matched) continue;
        found.push({
          connectionId: only.connectionId,
          connectorId: only.connectorId,
          label: only.label,
          matched,
        });
        break;
      }
    }
  }

  return found;
}

function scopeKey(scope: ComposerConnectorScope) {
  return `${scope.connectorId}:${scope.connectionId}`;
}

/**
 * Sync auto-detected connector chips with composer blocks.
 * Manual chips (menu) are preserved; dismissed ids stay out until restored.
 */
export function syncDetectedConnectorBlocks(
  blocks: ComposerBlock[],
  mentions: ConnectorMention[],
  opts: {
    dismissedConnectorIds: ReadonlySet<string>;
    manualConnectorIds: ReadonlySet<string>;
  },
): ComposerBlock[] {
  const desiredAuto = mentions.filter(
    (m) =>
      !opts.dismissedConnectorIds.has(m.connectorId) &&
      !opts.manualConnectorIds.has(m.connectorId),
  );
  const desiredAutoIds = new Set(desiredAuto.map((m) => m.connectorId));
  const current = connectorsFromBlocks(blocks);

  const withoutStaleAuto = blocks.filter((block) => {
    if (block.type !== "connector") return true;
    const id = block.scope.connectorId;
    if (opts.manualConnectorIds.has(id)) return true;
    return desiredAutoIds.has(id);
  });

  const presentIds = new Set(
    connectorsFromBlocks(withoutStaleAuto).map((c) => c.connectorId),
  );
  const toAdd = desiredAuto.filter((m) => !presentIds.has(m.connectorId));

  if (!toAdd.length) {
    const nextScopes = connectorsFromBlocks(withoutStaleAuto);
    const same =
      nextScopes.length === current.length &&
      nextScopes.every(
        (s, i) =>
          scopeKey(s) === scopeKey(current[i]!),
      );
    if (same) return blocks;
    return normalizeComposerBlocks(withoutStaleAuto);
  }

  const chips: ComposerBlock[] = toAdd.map((m) => ({
    key: `c_auto_${m.connectionId}`,
    type: "connector",
    scope: {
      connectionId: m.connectionId,
      connectorId: m.connectorId,
      label: m.label,
    },
  }));

  return normalizeComposerBlocks([...chips, ...withoutStaleAuto]);
}

/** Mentions that are still in text but currently dismissed (click to restore). */
export function dismissedMentionsStillPresent(
  mentions: ConnectorMention[],
  dismissedConnectorIds: ReadonlySet<string>,
): ConnectorMention[] {
  return mentions.filter((m) => dismissedConnectorIds.has(m.connectorId));
}
