/**
 * Connector reply sanitization — user-facing voice only.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  finalizeConnectorReply,
  gmailEmptyResultMessage,
  isEmptyGmailSearchResult,
  looksLikeInternalConnectorReply,
} from "../lib/ai/connectors/connector-response.ts";

describe("connector response voice", () => {
  it("detects internal connector jargon", () => {
    assert.equal(
      looksLikeInternalConnectorReply(
        "The follow-up Gmail search was requested for emails from the last day, but no new tool results were returned.",
      ),
      true,
    );
    assert.equal(
      looksLikeInternalConnectorReply("I don't see any new emails."),
      false,
    );
  });

  it("replaces internal empty-result replies with plain language", () => {
    const text = finalizeConnectorReply({
      text: "The follow-up Gmail search was requested, but no new tool results were returned, so I can't confirm whether another email came through.",
      connectorId: "gmail",
      userMessage: "Can you check again? I feel like I got another email.",
      toolResults: [
        {
          name: "gmail.search",
          ok: true,
          output: JSON.stringify({ outcome: "ok", count: 0, messages: [] }),
        },
      ],
    });
    assert.match(text, /don't see any new emails/i);
    assert.doesNotMatch(text, /tool results/i);
  });

  it("detects empty gmail search payloads", () => {
    assert.equal(
      isEmptyGmailSearchResult({
        name: "gmail.search",
        ok: true,
        output: JSON.stringify({ count: 0, messages: [] }),
      }),
      true,
    );
    assert.equal(
      isEmptyGmailSearchResult({
        name: "gmail.search",
        ok: true,
        output: JSON.stringify({ count: 2, messages: [{}, {}] }),
      }),
      false,
    );
  });

  it("tailors empty copy for follow-up asks", () => {
    assert.match(
      gmailEmptyResultMessage("Can you check again for a new email?"),
      /new emails/i,
    );
  });
});
