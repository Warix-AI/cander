import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractInteractiveRefs,
  formatObservationForModel,
  truncateObservation,
} from "../lib/computer/browser-observation.ts";
import {
  recommendWebToolLevel,
  shouldEscalateToBrowser,
  shouldOpenVisibleResearchTab,
  toolNameForLevel,
} from "../lib/computer/tool-routing.ts";

describe("browser-observation", () => {
  it("extracts interactive refs from snapshot", () => {
    const refs = extractInteractiveRefs("button @e1\nlink @e2\nbutton @e1");
    assert.deepEqual(refs, ["@e1", "@e2"]);
  });

  it("truncates long snapshots", () => {
    const obs = truncateObservation({
      url: "https://example.com",
      title: "Ex",
      snapshot: "x".repeat(20_000),
    });
    assert.equal(obs.snapshot.length, 12_000);
  });

  it("formats observation for model prompt", () => {
    const text = formatObservationForModel({
      url: "https://canderhq.com",
      title: "Cander",
      snapshot: "button @e1",
    });
    assert.match(text, /Accessibility snapshot/);
    assert.match(text, /@e1/);
  });
});

describe("tool-routing", () => {
  it("recommends browser for browse intent", () => {
    assert.equal(
      recommendWebToolLevel({ userMessage: "go to stripe.com pricing" }),
      3,
    );
    assert.equal(toolNameForLevel(3), "computer.browser.open");
  });

  it("escalates when web.open returns thin content", () => {
    assert.equal(
      shouldEscalateToBrowser({
        webOpenOk: true,
        textLength: 50,
        userMessage: "read this page",
      }),
      true,
    );
  });

  it("opens visible research tab only on show intent", () => {
    assert.equal(shouldOpenVisibleResearchTab("what's the weather in SF"), false);
    assert.equal(shouldOpenVisibleResearchTab("show me the page"), true);
    assert.equal(shouldOpenVisibleResearchTab("open the site"), true);
  });
});
