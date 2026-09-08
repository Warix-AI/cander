import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isAllowedProductionUpstreamOrigin,
  productionAppHost,
  productionAppUrl,
  draftPreviewHost,
} from "../lib/build/preview/urls.ts";
import {
  isReservedSubdomain,
  isValidSubdomainLabel,
} from "../lib/build/subdomain.ts";

describe("production host helpers", () => {
  it("formats production hosts without draft-- prefix", () => {
    assert.equal(productionAppHost("acme"), "acme.cander.app");
    assert.equal(productionAppUrl("acme"), "https://acme.cander.app");
    assert.equal(draftPreviewHost("acme"), "draft--acme.cander.app");
  });

  it("allows vercel.app production origins only", () => {
    assert.equal(
      isAllowedProductionUpstreamOrigin("https://my-app-abc.vercel.app"),
      true,
    );
    assert.equal(
      isAllowedProductionUpstreamOrigin("http://my-app.vercel.app"),
      false,
    );
    assert.equal(
      isAllowedProductionUpstreamOrigin("https://acme.cander.app"),
      false,
    );
    assert.equal(
      isAllowedProductionUpstreamOrigin("https://evil.example.com"),
      false,
    );
    assert.equal(
      isAllowedProductionUpstreamOrigin("https://sbx.vercel.run"),
      false,
    );
  });
});

describe("production subdomain eligibility", () => {
  it("rejects reserved and draft/markdown patterns", () => {
    assert.equal(isValidSubdomainLabel("acme"), true);
    assert.equal(isReservedSubdomain("www"), true);
    assert.equal(isValidSubdomainLabel("www"), false);
    assert.equal(isValidSubdomainLabel("draft--acme"), false);
    assert.equal(isValidSubdomainLabel("m" + "a".repeat(24)), false);
  });
});
