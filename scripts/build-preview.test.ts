import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  draftPreviewHost,
  draftPreviewUrl,
  isAllowedPreviewUpstreamOrigin,
  projectPreviewPath,
  rewriteHtmlForPreviewProxy,
} from "../lib/build/preview/urls.ts";

describe("preview upstream allowlist", () => {
  it("allows vercel sandbox hosts", () => {
    assert.equal(
      isAllowedPreviewUpstreamOrigin("https://sbx-abc.vercel.app"),
      true,
    );
    assert.equal(
      isAllowedPreviewUpstreamOrigin("https://foo.vercel.run"),
      true,
    );
  });

  it("rejects localhost and arbitrary hosts", () => {
    assert.equal(
      isAllowedPreviewUpstreamOrigin("http://127.0.0.1:3000"),
      false,
    );
    assert.equal(
      isAllowedPreviewUpstreamOrigin("https://evil.example.com"),
      false,
    );
    assert.equal(
      isAllowedPreviewUpstreamOrigin("https://notvercel.example.com"),
      false,
    );
    assert.equal(
      isAllowedPreviewUpstreamOrigin("https://acme.cander.app"),
      false,
    );
  });
});

describe("preview path helpers", () => {
  it("embeds workspaceId in the path proxy URL", () => {
    assert.equal(
      projectPreviewPath("proj-1", "ws-2"),
      "/api/projects/proj-1/preview/ws-2/",
    );
  });

  it("formats draft hosts", () => {
    assert.equal(draftPreviewHost("acme"), "draft--acme.cander.app");
    assert.equal(draftPreviewUrl("acme"), "https://draft--acme.cander.app");
  });
});

describe("HTML rewrite for path proxy", () => {
  it("rewrites root-relative assets under the prefix", () => {
    const html =
      '<html><head><link href="/_next/static/x.css"/><script src="/_next/y.js"></script></head><body><a href="/about">About</a><style>body{background:url(/img.png)}</style></body></html>';
    const out = rewriteHtmlForPreviewProxy(
      html,
      "/api/projects/p/preview/w",
    );
    assert.match(out, /href="\/api\/projects\/p\/preview\/w\/_next\/static\/x\.css"/);
    assert.match(out, /src="\/api\/projects\/p\/preview\/w\/_next\/y\.js"/);
    assert.match(out, /href="\/api\/projects\/p\/preview\/w\/about"/);
    assert.match(out, /url\(\/api\/projects\/p\/preview\/w\/img\.png\)/);
  });

  it("leaves protocol-relative and absolute URLs alone", () => {
    const html =
      '<a href="//cdn.example/x">x</a><img src="https://cdn.example/y.png"/>';
    const out = rewriteHtmlForPreviewProxy(html, "/api/projects/p/preview/w");
    assert.equal(out, html);
  });

  it("no-ops when rewrite prefix is empty (host proxy)", () => {
    const html = '<a href="/about">About</a>';
    assert.equal(rewriteHtmlForPreviewProxy(html, ""), html);
  });
});
