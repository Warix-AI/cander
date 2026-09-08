import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  slugifySubdomain,
  isReservedSubdomain,
  isValidSubdomainLabel,
  subdomainCandidates,
} from "../lib/build/subdomain.ts";
import { normalizePemKey } from "../lib/build/config.ts";

describe("build subdomain", () => {
  it("slugifies titles", () => {
    assert.equal(slugifySubdomain("My Cool App"), "my-cool-app");
    assert.equal(slugifySubdomain("  Hello!!! "), "hello");
    assert.equal(slugifySubdomain("123start"), "app-123start");
  });

  it("rejects reserved and markdown share hosts", () => {
    assert.equal(isReservedSubdomain("www"), true);
    assert.equal(isReservedSubdomain("api"), true);
    assert.equal(
      isReservedSubdomain("m" + "a".repeat(24)),
      true,
    );
    assert.equal(isReservedSubdomain("my-app"), false);
  });

  it("validates labels", () => {
    assert.equal(isValidSubdomainLabel("my-app"), true);
    assert.equal(isValidSubdomainLabel("www"), false);
    assert.equal(isValidSubdomainLabel("-bad"), false);
  });

  it("produces unique-ish candidates", () => {
    const list = subdomainCandidates({
      title: "Acme Portal",
      projectId: "550e8400-e29b-41d4-a716-446655440000",
    });
    assert.ok(list.includes("acme-portal"));
    assert.ok(list.length >= 2);
    for (const s of list) {
      assert.equal(isValidSubdomainLabel(s), true);
    }
  });
});

describe("normalizePemKey", () => {
  it("expands literal newlines", () => {
    const pem = normalizePemKey(
      "-----BEGIN RSA PRIVATE KEY-----\\nABC\\n-----END RSA PRIVATE KEY-----",
    );
    assert.ok(pem.includes("\nABC\n"));
  });
});
