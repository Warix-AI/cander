/**
 * Auth acquisition + IP parsing helpers.
 * Run: node --experimental-strip-types --test scripts/auth-attribution.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clientIpFromHeaders,
  geoFromHeaders,
} from "../lib/auth/request-geo.ts";

describe("clientIpFromHeaders", () => {
  it("prefers cf-connecting-ip", () => {
    const headers = new Headers({
      "cf-connecting-ip": "203.0.113.9",
      "x-forwarded-for": "198.51.100.1, 203.0.113.9",
    });
    assert.equal(clientIpFromHeaders(headers), "203.0.113.9");
  });

  it("takes first x-forwarded-for hop", () => {
    const headers = new Headers({
      "x-forwarded-for": "198.51.100.7, 203.0.113.1",
    });
    assert.equal(clientIpFromHeaders(headers), "198.51.100.7");
  });

  it("strips IPv4 port", () => {
    const headers = new Headers({ "x-real-ip": "198.51.100.7:443" });
    assert.equal(clientIpFromHeaders(headers), "198.51.100.7");
  });
});

describe("geoFromHeaders", () => {
  it("reads vercel / cloudflare geo headers", () => {
    const headers = new Headers({
      "x-vercel-ip-country": "IN",
      "x-vercel-ip-country-region": "KA",
      "x-vercel-ip-city": "Bengaluru",
    });
    assert.deepEqual(geoFromHeaders(headers), {
      country: "IN",
      region: "KA",
      city: "Bengaluru",
    });
  });
});
