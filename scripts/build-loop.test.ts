/**
 * Build-loop turn classification — keep company names out of connect mocks.
 */
import assert from "node:assert/strict";
import { describe, it, test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

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

describe("repair / fix must use live Build", () => {
  it("classifies repair requests as fix", () => {
    assert.equal(classifyTurn("repair"), "fix");
    assert.equal(classifyTurn("repair the site"), "fix");
    assert.equal(classifyTurn("fix this"), "fix");
  });

  it("AppProvider includes fix in useLiveAi and gates the canned checklist", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(
      join(here, "../components/app/AppProvider.tsx"),
      "utf8",
    );
    const liveBlock = src.slice(
      src.indexOf("const useLiveAi ="),
      src.indexOf("const useLiveAi =") + 400,
    );
    assert.ok(
      liveBlock.includes('kind === "fix"'),
      "useLiveAi must include fix",
    );
    assert.ok(
      src.includes('!useLiveAi && kind === "fix"'),
      "canned repair checklist must be offline-only",
    );
  });
});
