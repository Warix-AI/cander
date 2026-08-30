/**
 * Bridge error sanitization tests.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  bridgeHttpFailureMessage,
  isBridgeOfflineError,
  isHtmlErrorPayload,
  userFacingTurnError,
} from "../lib/ai/bridge-errors.ts";

const CLOUDFLARE_502 = `<!DOCTYPE html>
<html><head><title>trycloudflare.com | 502: Bad gateway</title></head>
<body><h1>Bad gateway</h1></body></html>`;

describe("bridge error sanitization", () => {
  it("detects HTML error payloads", () => {
    assert.equal(isHtmlErrorPayload(CLOUDFLARE_502), true);
  });

  it("treats cloudflare 502 HTML as bridge offline", () => {
    assert.equal(isBridgeOfflineError(CLOUDFLARE_502), true);
  });

  it("maps bridge HTTP failures without leaking HTML", () => {
    assert.equal(
      bridgeHttpFailureMessage(502, CLOUDFLARE_502),
      "AI bridge unavailable",
    );
  });

  it("returns a short user message instead of raw HTML", () => {
    const facing = userFacingTurnError(CLOUDFLARE_502);
    assert.equal(facing.offline, true);
    assert.ok(!facing.content.includes("<!DOCTYPE"));
    assert.ok(!facing.content.includes("Cloudflare"));
  });

  it("uses generic message for unknown errors", () => {
    const facing = userFacingTurnError("unexpected parser failure");
    assert.equal(facing.content, "Something went wrong.");
    assert.equal(facing.offline, false);
  });
});
