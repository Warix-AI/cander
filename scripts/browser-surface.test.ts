import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canEmbedInPwa,
  isAllowedLocalBrowserUrl,
  localBrowserPartition,
} from "../lib/browser-surface/local-browsing.ts";

describe("local-browsing security", () => {
  it("partitions web tabs per user and previews per project", () => {
    assert.equal(
      localBrowserPartition({ userId: "u1" }),
      "persist:cander-web-u1",
    );
    assert.equal(
      localBrowserPartition({
        isolatedPartition: true,
        projectId: "p1",
        userId: "u1",
      }),
      "persist:cander-preview-p1",
    );
    assert.notEqual(
      localBrowserPartition({ userId: "u1" }),
      localBrowserPartition({ userId: "u2" }),
    );
    assert.notEqual(
      localBrowserPartition({ isolatedPartition: true, projectId: "a" }),
      localBrowserPartition({ isolatedPartition: true, projectId: "b" }),
    );
  });

  it("blocks private / local hosts for local browsing", () => {
    assert.equal(isAllowedLocalBrowserUrl("https://example.com"), true);
    assert.equal(isAllowedLocalBrowserUrl("about:blank"), true);
    assert.equal(isAllowedLocalBrowserUrl("http://localhost:3000"), false);
    assert.equal(isAllowedLocalBrowserUrl("http://127.0.0.1"), false);
    assert.equal(isAllowedLocalBrowserUrl("http://192.168.1.1"), false);
    assert.equal(isAllowedLocalBrowserUrl("http://10.0.0.2"), false);
    assert.equal(isAllowedLocalBrowserUrl("file:///etc/passwd"), false);
    assert.equal(isAllowedLocalBrowserUrl("javascript:alert(1)"), false);
  });

  it("only embeds first-party / preview hosts in PWA", () => {
    assert.equal(canEmbedInPwa("https://cander.app/foo"), true);
    assert.equal(canEmbedInPwa("https://www.canderhq.com"), true);
    assert.equal(
      canEmbedInPwa("https://my-app.vercel.app", true),
      true,
    );
    assert.equal(canEmbedInPwa("https://stripe.com"), false);
    assert.equal(canEmbedInPwa("https://stripe.com", true), false);
    assert.equal(canEmbedInPwa("https://www.google.com"), false);
  });
});

describe("electron partition mirror", () => {
  it("matches desktop browser-security partitionFor rules", async () => {
    const { createRequire } = await import("node:module");
    const require = createRequire(import.meta.url);
    const { partitionFor, isAllowedUrl } = require("../desktop/src/browser-security.js");
    assert.equal(partitionFor({ userId: "u1" }), "persist:cander-web-u1");
    assert.equal(
      partitionFor({ isolatedPartition: true, projectId: "p9" }),
      "persist:cander-preview-p9",
    );
    assert.equal(isAllowedUrl("https://canderhq.com"), true);
    assert.equal(isAllowedUrl("http://127.0.0.1"), false);
  });
});
