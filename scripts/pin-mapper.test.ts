import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  pinRowToPin,
  pinToRow,
  type UserPinRow,
} from "../lib/supabase/org-policy-mapper.ts";

const firstProfile = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const secondProfile = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

describe("user pin storage identity", () => {
  it("lets two profiles save the same Gmail pin without a primary-key collision", () => {
    const pin = { kind: "connector", id: "gmail", tier: "primary" } as const;
    const firstRow = pinToRow(pin, firstProfile, 0);
    const secondRow = pinToRow(pin, secondProfile, 0);

    assert.notEqual(firstRow.id, secondRow.id);
    assert.equal(firstRow.profile_id, firstProfile);
    assert.equal(secondRow.profile_id, secondProfile);
    assert.deepEqual(pinRowToPin(firstRow), pin);
    assert.deepEqual(pinRowToPin(secondRow), pin);
  });

  it("keeps identity stable when a pin moves or changes tier", () => {
    const original = pinToRow(
      { kind: "project", id: "gmail", tier: "primary" },
      firstProfile,
      0,
    );
    const moved = pinToRow(
      { kind: "project", id: "gmail", tier: "secondary" },
      firstProfile,
      4,
    );
    const connector = pinToRow(
      { kind: "connector", id: "gmail", tier: "primary" },
      firstProfile,
      0,
    );

    assert.equal(moved.id, original.id);
    assert.notEqual(connector.id, original.id);
    assert.equal(moved.tier, "secondary");
    assert.equal(moved.sort_order, 4);
  });

  it("reads legacy rows and preserves their pin when saving with a scoped ID", () => {
    const legacyRow: UserPinRow = {
      id: "pin-connector-gmail",
      profile_id: firstProfile,
      kind: "connector",
      target_id: "gmail",
      tier: "secondary",
      sort_order: 2,
    };

    const pin = pinRowToPin(legacyRow);
    const upgradedRow = pinToRow(pin, legacyRow.profile_id, legacyRow.sort_order);

    assert.deepEqual(pin, { kind: "connector", id: "gmail", tier: "secondary" });
    assert.notEqual(upgradedRow.id, legacyRow.id);
    assert.deepEqual(pinRowToPin(upgradedRow), pin);
    assert.equal(upgradedRow.profile_id, legacyRow.profile_id);
    assert.equal(upgradedRow.sort_order, legacyRow.sort_order);
  });
});
