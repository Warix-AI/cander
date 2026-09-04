/**
 * Detect workspace connector mentions in composer text / dictation.
 * Matches product names + common aliases against connected apps only,
 * then replaces the trigger word inline with a connector chip.
 */

import {
  connectorsFromBlocks,
  normalizeComposerBlocks,
  textFromBlocks,
  triggersFromBlocks,
  type ComposerBlock,
  type ComposerConnectorBlock,
  type ComposerTextBlock,
  type ComposerTriggerBlock,
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
  /** Start index within `textFromBlocks` concatenation. */
  index: number;
};

/** Extra aliases beyond catalog `name` / `id`. Prefer product-specific terms. */
const CONNECTOR_ALIASES: Record<string, string[]> = {
  gmail: ["gmail", "google mail", "googlemail"],
  gcal: ["google calendar", "gcal", "g calendar"],
  gdrive: ["google drive", "gdrive", "g drive"],
  gsheets: ["google sheets", "gsheets", "g sheets", "spreadsheet", "spreadsheets"],
  gdocs: ["google docs", "gdocs", "g docs", "google documents"],
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

function firstMatchInText(
  text: string,
  trigger: string,
): { matched: string; index: number } | null {
  if (!text || !trigger) return null;
  const re = wordBoundaryPattern(trigger);
  const hit = re.exec(text);
  if (!hit?.[1]) return null;
  const matched = hit[1];
  // Group 1 may sit after a boundary char at hit.index.
  const index = hit.index + hit[0].indexOf(matched);
  return { matched, index };
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
      const hit = firstMatchInText(text, trigger);
      if (!hit) continue;
      found.push({
        connectionId: row.connectionId,
        connectorId: row.connectorId,
        label: row.label,
        matched: hit.matched,
        index: hit.index,
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
        const hit = firstMatchInText(text, trigger);
        if (!hit) continue;
        found.push({
          connectionId: only.connectionId,
          connectorId: only.connectorId,
          label: only.label,
          matched: hit.matched,
          index: hit.index,
        });
        break;
      }
    }
  }

  return found;
}

function newKey(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Replace a mention span inside concatenated text blocks with an inline chip.
 * Processes a single mention; caller should apply from end → start when many.
 * Focus lands in the text segment after the chip so typing can continue.
 */
export function replaceMentionInline(
  blocks: ComposerBlock[],
  mention: ConnectorMention,
): {
  blocks: ComposerBlock[];
  focusKey: string | null;
  cursor: number;
} {
  const already = blocks.some(
    (b) =>
      b.type === "connector" && b.scope.connectorId === mention.connectorId,
  );
  if (already) return { blocks, focusKey: null, cursor: 0 };

  let offset = 0;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!;
    if (block.type !== "text") {
      // Keep offset aligned with textFromBlocks (triggers contribute matched text).
      offset +=
        block.type === "trigger" ? block.matched.length : 0;
      continue;
    }
    const end = offset + block.value.length;
    if (mention.index < offset || mention.index >= end) {
      offset = end;
      continue;
    }
    const localStart = mention.index - offset;
    const localEnd = localStart + mention.matched.length;
    if (localEnd > block.value.length) {
      // Match spans a chip boundary — skip; rare for product names.
      return { blocks, focusKey: null, cursor: 0 };
    }
    // Keep surrounding spaces in the text segments so spacing matches a normal word.
    const left = block.value.slice(0, localStart);
    const right = block.value.slice(localEnd);
    const focusKey = newKey("t");
    const chip: ComposerConnectorBlock = {
      key: `c_auto_${mention.connectionId}`,
      type: "connector",
      scope: {
        connectionId: mention.connectionId,
        connectorId: mention.connectorId,
        label: mention.label,
      },
      replacedText: mention.matched,
    };
    const next: ComposerBlock[] = [
      ...blocks.slice(0, i),
      { key: block.key, type: "text", value: left } satisfies ComposerTextBlock,
      chip,
      { key: focusKey, type: "text", value: right },
      ...blocks.slice(i + 1),
    ];
    const normalized = normalizeComposerBlocks(next);
    const chipIdx = normalized.findIndex(
      (b) =>
        b.type === "connector" &&
        b.scope.connectionId === mention.connectionId,
    );
    const after = chipIdx >= 0 ? normalized[chipIdx + 1] : null;
    return {
      blocks: normalized,
      focusKey: after?.type === "text" ? after.key : focusKey,
      cursor: 0,
    };
  }
  return { blocks, focusKey: null, cursor: 0 };
}

/**
 * Sync auto-detected connector chips with composer blocks.
 * New mentions replace the trigger word inline. Existing auto chips stay
 * (the trigger was removed from text). Manual chips are preserved.
 */
export function syncDetectedConnectorBlocks(
  blocks: ComposerBlock[],
  mentions: ConnectorMention[],
  opts: {
    dismissedConnectorIds: ReadonlySet<string>;
    manualConnectorIds: ReadonlySet<string>;
  },
): {
  blocks: ComposerBlock[];
  focusKey: string | null;
  cursor: number;
} {
  const presentIds = new Set(
    connectorsFromBlocks(blocks).map((c) => c.connectorId),
  );
  const triggerIds = new Set(
    triggersFromBlocks(blocks).map((t) => t.preferredConnectorId),
  );

  const toAdd = mentions
    .filter(
      (m) =>
        !opts.dismissedConnectorIds.has(m.connectorId) &&
        !opts.manualConnectorIds.has(m.connectorId) &&
        !presentIds.has(m.connectorId) &&
        !triggerIds.has(m.connectorId),
    )
    // Replace from the end so earlier indices stay valid.
    .sort((a, b) => b.index - a.index);

  if (!toAdd.length) return { blocks, focusKey: null, cursor: 0 };

  let next = blocks;
  let focusKey: string | null = null;
  let cursor = 0;
  for (const mention of toAdd) {
    const result = replaceMentionInline(next, mention);
    next = result.blocks;
    // First processed is the rightmost mention (where the user was typing).
    if (result.focusKey && focusKey == null) {
      focusKey = result.focusKey;
      cursor = result.cursor;
    }
  }
  return { blocks: next, focusKey, cursor };
}

/** Mentions that are still in text but currently dismissed (click to restore). */
export function dismissedMentionsStillPresent(
  mentions: ConnectorMention[],
  dismissedConnectorIds: ReadonlySet<string>,
): ConnectorMention[] {
  return mentions.filter((m) => dismissedConnectorIds.has(m.connectorId));
}

/**
 * Connected apps the user can attach from a dismissed trigger word.
 * Mail triggers (product name or generic "email") offer every connected mail app.
 */
export function relatedCandidatesForTrigger(
  trigger: Pick<
    ComposerTriggerBlock,
    "matched" | "preferredConnectorId"
  >,
  candidates: ConnectorDetectCandidate[],
): ConnectorDetectCandidate[] {
  const matchedNorm = normalizeTrigger(trigger.matched);
  const isGenericMail = GENERIC_MAIL_ALIASES.includes(matchedNorm);
  const isMailFamily =
    isGenericMail || MAIL_CONNECTOR_IDS.has(trigger.preferredConnectorId);

  if (isMailFamily) {
    const mail = candidates.filter((c) =>
      MAIL_CONNECTOR_IDS.has(c.connectorId),
    );
    if (mail.length) {
      return [
        ...mail.filter(
          (c) => c.connectorId === trigger.preferredConnectorId,
        ),
        ...mail.filter(
          (c) => c.connectorId !== trigger.preferredConnectorId,
        ),
      ];
    }
  }

  const preferred = candidates.find(
    (c) => c.connectorId === trigger.preferredConnectorId,
  );
  return preferred ? [preferred] : [];
}

/** @internal test helper */
export function __textFromBlocks(blocks: ComposerBlock[]) {
  return textFromBlocks(blocks);
}
