/**
 * Composer connector auto-detect from typed / dictated trigger words.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  blocksFromText,
  connectorsFromBlocks,
  emptyComposerBlocks,
  promoteTriggerToConnector,
  removeConnectorBlockRestoringText,
  serializeComposerBlocks,
  textFromBlocks,
  triggersFromBlocks,
  type ComposerBlock,
} from "../lib/composer-blocks.ts";
import {
  detectConnectorMentions,
  dismissedMentionsStillPresent,
  relatedCandidatesForTrigger,
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
    assert.ok(typeof hits[0]?.index === "number");
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

  it("replaces the trigger word inline with the connector chip", () => {
    let blocks: ComposerBlock[] = blocksFromText(
      "All right, go ahead and send an email to braydon@example.com",
    );
    const mentions = detectConnectorMentions(textFromBlocks(blocks), [gmail]);
    assert.equal(mentions[0]?.matched.toLowerCase(), "email");
    blocks = syncDetectedConnectorBlocks(blocks, mentions, {
      dismissedConnectorIds: new Set(),
      manualConnectorIds: new Set(),
    }).blocks;
    assert.equal(connectorsFromBlocks(blocks).length, 1);
    assert.equal(textFromBlocks(blocks).includes("email"), false);
    assert.match(textFromBlocks(blocks), /send an\s+to braydon/i);
    assert.match(
      serializeComposerBlocks(blocks),
      /send an Gmail to braydon/i,
    );
    const chip = blocks.find((b) => b.type === "connector");
    assert.equal(
      chip?.type === "connector" && chip.replacedText?.toLowerCase(),
      "email",
    );
  });

  it("returns focus on the text segment after the inserted chip", () => {
    const blocks = blocksFromText("Check my Gmail please");
    const mentions = detectConnectorMentions(textFromBlocks(blocks), [gmail]);
    const result = syncDetectedConnectorBlocks(blocks, mentions, {
      dismissedConnectorIds: new Set(),
      manualConnectorIds: new Set(),
    });
    assert.ok(result.focusKey);
    const afterChip = result.blocks.findIndex(
      (b) => b.type === "connector" && b.scope.connectorId === "gmail",
    );
    assert.ok(afterChip >= 0);
    const focusBlock = result.blocks[afterChip + 1];
    assert.equal(focusBlock?.type, "text");
    assert.equal(
      focusBlock?.type === "text" && focusBlock.key,
      result.focusKey,
    );
    assert.equal(result.cursor, 0);
  });

  it("keeps the inline chip after the trigger word is gone from text", () => {
    let blocks: ComposerBlock[] = blocksFromText("Check my Gmail please");
    blocks = syncDetectedConnectorBlocks(
      blocks,
      detectConnectorMentions(textFromBlocks(blocks), [gmail]),
      {
        dismissedConnectorIds: new Set(),
        manualConnectorIds: new Set(),
      },
    ).blocks;
    assert.equal(connectorsFromBlocks(blocks).length, 1);
    // Sync again with no mention in remaining text — chip stays.
    blocks = syncDetectedConnectorBlocks(blocks, [], {
      dismissedConnectorIds: new Set(),
      manualConnectorIds: new Set(),
    }).blocks;
    assert.equal(connectorsFromBlocks(blocks).length, 1);
  });

  it("turns a dismissed chip into a clickable trigger word", () => {
    let blocks: ComposerBlock[] = blocksFromText("send an email to them");
    blocks = syncDetectedConnectorBlocks(
      blocks,
      detectConnectorMentions(textFromBlocks(blocks), [gmail]),
      {
        dismissedConnectorIds: new Set(),
        manualConnectorIds: new Set(),
      },
    ).blocks;
    const connectionId = connectorsFromBlocks(blocks)[0]!.connectionId;
    blocks = removeConnectorBlockRestoringText(blocks, connectionId);
    assert.equal(connectorsFromBlocks(blocks).length, 0);
    const triggers = triggersFromBlocks(blocks);
    assert.equal(triggers.length, 1);
    assert.equal(triggers[0]?.matched.toLowerCase(), "email");
    assert.equal(triggers[0]?.preferredConnectorId, "gmail");
    assert.match(textFromBlocks(blocks), /send an email to them/i);
  });

  it("promotes a trigger word back to a connector chip on click", () => {
    let blocks: ComposerBlock[] = blocksFromText("Check Gmail please");
    blocks = syncDetectedConnectorBlocks(
      blocks,
      detectConnectorMentions(textFromBlocks(blocks), [gmail]),
      {
        dismissedConnectorIds: new Set(),
        manualConnectorIds: new Set(),
      },
    ).blocks;
    blocks = removeConnectorBlockRestoringText(
      blocks,
      connectorsFromBlocks(blocks)[0]!.connectionId,
    );
    const trigger = triggersFromBlocks(blocks)[0]!;
    const result = promoteTriggerToConnector(blocks, trigger.key, gmail);
    assert.equal(connectorsFromBlocks(result.blocks).length, 1);
    assert.equal(triggersFromBlocks(result.blocks).length, 0);
    assert.equal(
      connectorsFromBlocks(result.blocks)[0]?.connectorId,
      "gmail",
    );
    assert.ok(result.focusKey);
  });

  it("offers related mail connectors for a dismissed email trigger", () => {
    const related = relatedCandidatesForTrigger(
      { matched: "email", preferredConnectorId: "gmail" },
      [gmail, outlook, slack],
    );
    assert.deepEqual(
      related.map((r) => r.connectorId),
      ["gmail", "outlook"],
    );
  });

  it("does not auto-rechip while a trigger block is present", () => {
    let blocks: ComposerBlock[] = blocksFromText("Check Gmail please");
    blocks = syncDetectedConnectorBlocks(
      blocks,
      detectConnectorMentions(textFromBlocks(blocks), [gmail]),
      {
        dismissedConnectorIds: new Set(),
        manualConnectorIds: new Set(),
      },
    ).blocks;
    blocks = removeConnectorBlockRestoringText(
      blocks,
      connectorsFromBlocks(blocks)[0]!.connectionId,
    );
    const mentions = detectConnectorMentions(textFromBlocks(blocks), [gmail]);
    assert.ok(mentions.some((m) => m.connectorId === "gmail"));
    blocks = syncDetectedConnectorBlocks(blocks, mentions, {
      dismissedConnectorIds: new Set(["gmail"]),
      manualConnectorIds: new Set(),
    }).blocks;
    assert.equal(connectorsFromBlocks(blocks).length, 0);
    assert.equal(triggersFromBlocks(blocks).length, 1);
  });

  it("keeps dismissed chips out until the trigger leaves the text", () => {
    const text = "Check Gmail please";
    const mentions = detectConnectorMentions(text, [gmail]);
    let blocks = syncDetectedConnectorBlocks(emptyComposerBlocks(), mentions, {
      dismissedConnectorIds: new Set(["gmail"]),
      manualConnectorIds: new Set(),
    }).blocks;
    assert.equal(connectorsFromBlocks(blocks).length, 0);
    assert.equal(
      dismissedMentionsStillPresent(mentions, new Set(["gmail"])).length,
      1,
    );

    // Trigger gone → dismiss clears on next sync; typing it again re-adds.
    blocks = syncDetectedConnectorBlocks(blocksFromText(text), mentions, {
      dismissedConnectorIds: new Set(),
      manualConnectorIds: new Set(),
    }).blocks;
    assert.equal(connectorsFromBlocks(blocks)[0]?.connectorId, "gmail");
  });

  it("preserves manual chips even when the word is gone", () => {
    const blocks: ComposerBlock[] = [
      { key: "t0", type: "text", value: "" },
      {
        key: "c1",
        type: "connector",
        scope: gmail,
      },
      { key: "t1", type: "text", value: "summarize today's plan" },
    ];
    const next = syncDetectedConnectorBlocks(blocks, [], {
      dismissedConnectorIds: new Set(),
      manualConnectorIds: new Set(["gmail"]),
    }).blocks;
    assert.equal(connectorsFromBlocks(next)[0]?.connectorId, "gmail");
  });
});
