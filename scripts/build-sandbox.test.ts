import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BUILD_APP_PORT,
  BUILD_SANDBOX_PURPOSE,
  BUILD_SANDBOX_TTL_MS,
} from "../lib/build/sandbox/constants.ts";

describe("build sandbox constants", () => {
  it("exposes app port and purpose", () => {
    assert.equal(BUILD_APP_PORT, 3000);
    assert.equal(BUILD_SANDBOX_PURPOSE, "build_app");
    assert.ok(BUILD_SANDBOX_TTL_MS >= 30 * 60 * 1000);
  });
});
