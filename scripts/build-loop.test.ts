/**
 * Build-loop turn classification — keep company names out of connect mocks.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { classifyTurn, connectService } from "../lib/build-loop.ts";

test("Connect Capital email question is chat, not connect", () => {
  const msg =
    "What is Connect Capital? Looks like I got an email from them.";
  assert.equal(classifyTurn(msg), "chat");
  assert.equal(connectService(msg), null);
});

test("explicit connect stripe is connect", () => {
  assert.equal(classifyTurn("connect stripe"), "connect");
  assert.deepEqual(connectService("connect stripe"), {
    service: "Stripe",
    keyName: "STRIPE_SECRET_KEY",
  });
});

test("integrate supabase is connect", () => {
  assert.equal(classifyTurn("integrate supabase for auth"), "connect");
});

test("connectService does not default to Stripe", () => {
  assert.equal(connectService("connect something random"), null);
});
