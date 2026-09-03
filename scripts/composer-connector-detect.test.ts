/**
 * Composer connector auto-detect from typed / dictated trigger words.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  blocksFromText,
  connectorsFromBlocks,
  emptyComposerBlocks,
  normalizeComposerBlocks,
  type ComposerBlock,
} from "../lib/composer-blocks.ts";
import {
  detectConnectorMentions,
  dismissedMentionsStillPresent,
  syncDetectedConnectorBlocks,
  triggersForConnector,
} from "../lib/composer-connector-detect.ts";

const gmail = {
  connectionId: "conn-gmail",
  connectorId: "gmail",
  label: "Gmail",
};
const slack = {
  connectionId: "conn-slack",
  connectorId: "slack",
  label: "Slack",
};
const outlook = {
  connectionId: "conn-outlook",
  connectorId: "outlook",
  label: "Outlook",
};

describe("composer connector detect", () => {
  it("matches Gmail product name in a sentence", () => {
    const hits = detectConnectorMentions(
      "Can you go check my Gmail for the latest?",
      [gmail, slack],
    );
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.connectorId, "gmail");
    assert.match(hits[0]!.matched, /gmail/i);
  });

  it("matches multiple connectors in one sentence", () => {
    const hits = detectConnectorMentions(
      "Check Slack and then look in Gmail",
      [gmail, slack],
    );
    assert.equal(hits.length, 2);
    assert.deepEqual(
      hits.map((h) => h.connectorId).sort(),
      ["gmail", "slack"],
    );
  });

  it("does not match connectors that are not connected", () => {
    const hits = detectConnectorMentions("check my Gmail", [slack]);
    assert.equal(hits.length, 0);
  });

  it("uses generic email only when a single mail connector is connected", () => {
    const onlyGmail = detectConnectorMentions("check my email inbox", [gmail]);
    assert.equal(onlyGmail[0]?.connectorId, "gmail");

    const ambiguous = detectConnectorMentions("check my email", [
      gmail,
      outlook,
    ]);
    assert.equal(ambiguous.length, 0);
  });

  it("builds aliases including catalog name", () => {
    const triggers = triggersForConnector("gcal", "Google Calendar");
    assert.ok(triggers.includes("google calendar"));
    assert.ok(triggers.includes("gcal"));
  });

  it("syncs auto chips in and out of blocks", () => {
    let blocks: ComposerBlock[] = blocksFromText(
      "Go check my Gmail for the latest",
    );
    const mentions = detectConnectorMentions(textOf(blocks), [gmail]);
    blocks = syncDetectedConnectorBlocks(blocks, mentions, {
      dismissedConnectorIds: new Set(),
      manualConnectorIds: new Set(),
    });
    assert.equal(connectorsFromBlocks(blocks).length, 1);
    assert.equal(connectorsFromBlocks(blocks)[0]?.connectorId, "gmail");

    blocks = normalizeComposerBlocks([
      ...connectorsFromBlocks(blocks).map((scope) => ({
        key: `c_${scope.connectionId}`,
        type: "connector" as const,
        scope,
      })),
      { key: "t1", type: "text", value: "never mind about that" },
    ]);
    const gone = detectConnectorMentions(textOf(blocks), [gmail]);
    blocks = syncDetectedConnectorBlocks(blocks, gone, {
      dismissedConnectorIds: new Set(),
      manualConnectorIds: new Set(),
    });
    assert.equal(connectorsFromBlocks(blocks).length, 0);
  });

  it("keeps dismissed chips out until restored", () => {
    const text = "Check Gmail please";
    const mentions = detectConnectorMentions(text, [gmail]);
    let blocks = syncDetectedConnectorBlocks(emptyComposerBlocks(), mentions, {
      dismissedConnectorIds: new Set(["gmail"]),
      manualConnectorIds: new Set(),
    });
    assert.equal(connectorsFromBlocks(blocks).length, 0);
    assert.equal(
      dismissedMentionsStillPresent(mentions, new Set(["gmail"])).length,
      1,
    );

    blocks = syncDetectedConnectorBlocks(blocksFromText(text), mentions, {
      dismissedConnectorIds: new Set(),
      manualConnectorIds: new Set(),
    });
    assert.equal(connectorsFromBlocks(blocks)[0]?.connectorId, "gmail");
  });

  it("preserves manual chips even when the word is gone", () => {
    const blocks: ComposerBlock[] = normalizeComposerBlocks([
      {
        key: "c1",
        type: "connector",
        scope: gmail,
      },
      { key: "t1", type: "text", value: "summarize today's plan" },
    ]);
    const next = syncDetectedConnectorBlocks(blocks, [], {
      dismissedConnectorIds: new Set(),
      manualConnectorIds: new Set(["gmail"]),
    });
    assert.equal(connectorsFromBlocks(next)[0]?.connectorId, "gmail");
  });
});

function textOf(blocks: ComposerBlock[]) {
  return blocks
    .filter((b) => b.type === "text")
    .map((b) => b.value)
    .join("");
}
