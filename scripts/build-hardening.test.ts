import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isAllowedCustomDomainHost,
  resolveSafePublishedUrl,
} from "../lib/build/publish/published-url.ts";

describe("safe published URL", () => {
  it("prefers matching cander subdomain", () => {
    const r = resolveSafePublishedUrl({
      preferredUrl: "https://acme.cander.app",
      ctx: { canderSubdomain: "acme" },
      fallbackUrl: "https://x.vercel.app",
    });
    assert.equal(r.url, "https://acme.cander.app");
    assert.equal(r.reason, "cander");
  });

  it("rejects unverified custom hosts", () => {
    const r = resolveSafePublishedUrl({
      preferredUrl: "https://app.customer.com",
      ctx: { canderSubdomain: "acme" },
      fallbackUrl: "https://x.vercel.app",
    });
    assert.equal(r.url, "https://acme.cander.app");
    assert.equal(r.reason, "cander");
  });

  it("allows verified custom domains", () => {
    const r = resolveSafePublishedUrl({
      preferredUrl: "https://app.customer.com",
      ctx: {
        canderSubdomain: "acme",
        verifiedCustomDomain: "app.customer.com",
      },
      fallbackUrl: "https://x.vercel.app",
    });
    assert.equal(r.url, "https://app.customer.com");
    assert.equal(r.reason, "custom");
  });
});

describe("custom domain host allowlist", () => {
  it("blocks platform and vercel hosts", () => {
    assert.equal(isAllowedCustomDomainHost("app.example.com"), true);
    assert.equal(isAllowedCustomDomainHost("foo.cander.app"), false);
    assert.equal(isAllowedCustomDomainHost("x.vercel.app"), false);
    assert.equal(isAllowedCustomDomainHost("localhost"), false);
  });
});
