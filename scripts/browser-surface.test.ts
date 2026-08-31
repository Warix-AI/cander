import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  canEmbedInPwa,
  isAllowedLocalBrowserUrl,
  localBrowserPartition,
} from "../lib/browser-surface/local-browsing.ts";

const root = join(import.meta.dirname, "..");

function readRepo(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

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

describe("browser URL normalization", () => {
  it("defaults new tabs and empty input to about:blank", () => {
    const preview = readRepo("lib/preview-url.ts");
    const session = readRepo("lib/project-browser-session.ts");
    const host = readRepo("components/browser/BrowserSurfaceHost.tsx");
    assert.match(preview, /return "about:blank"/);
    assert.match(session, /makeWebTab\(url = "about:blank"\)/);
    assert.match(host, /url === "about:blank"/);
    assert.match(host, /NewTabPage/);
  });

  it("does not render fake GoogleHome on native browser surfaces", () => {
    const host = readRepo("components/browser/BrowserSurfaceHost.tsx");
    assert.doesNotMatch(host, /<GoogleHome/);
    assert.match(host, /adapterId === "web-pwa" && isGoogleUrl\(url\)/);
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
