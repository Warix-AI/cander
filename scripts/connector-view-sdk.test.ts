/**
 * Connector SDK smoke tests — contracts without loading Composio/admin clients.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GMAIL_COMPOSIO_SLUGS } from "../lib/connectors/composio-tools.ts";
import type { ConnectorCapabilities } from "../lib/connectors/sdk/types.ts";

const gmailCapabilities: ConnectorCapabilities = {
  sync: true,
  list: true,
  readBody: true,
  compose: true,
  reply: true,
  archive: true,
  markRead: true,
  markUnread: true,
};

describe("connector view sdk", () => {
  it("declares gmail view capabilities for inbox operations", () => {
    assert.equal(gmailCapabilities.sync, true);
    assert.equal(gmailCapabilities.readBody, true);
    assert.equal(gmailCapabilities.archive, true);
  });

  it("maps archive and read-state tools to Composio slugs", () => {
    assert.equal(GMAIL_COMPOSIO_SLUGS["gmail.archive"], "GMAIL_REMOVE_LABEL");
    assert.equal(GMAIL_COMPOSIO_SLUGS["gmail.markRead"], "GMAIL_REMOVE_LABEL");
    assert.equal(
      GMAIL_COMPOSIO_SLUGS["gmail.markUnread"],
      "GMAIL_ADD_LABEL_TO_EMAIL",
    );
  });
});
