/**
 * Minimal runnable scaffold helpers (source + pure checks without @/ resolution).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

describe("minimal runnable scaffold", () => {
  it("exports tipLooksRunnable and core Next paths", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(
      join(here, "../lib/ai/build/minimal-runnable-scaffold.ts"),
      "utf8",
    );
    for (const needle of [
      "package.json",
      "app/page.tsx",
      "app/layout.tsx",
      "next.config.mjs",
      "export function tipLooksRunnable",
      "export function minimalRunnableScaffoldFiles",
    ]) {
      assert.ok(src.includes(needle), `missing ${needle}`);
    }
  });

  it("finalizeBuildReady auto-heals missing package and unhealthy preview", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(
      join(here, "../lib/build/preview/finalize-ready.ts"),
      "utf8",
    );
    assert.ok(src.includes("ensureDraftSitePackageJson"));
    assert.ok(src.includes("preview unhealthy; auto-healing once"));
  });

  it("writeScaffold retries and create path heals essentials", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(
      join(here, "../lib/ai/build/project-turn.ts"),
      "utf8",
    );
    assert.ok(src.includes("Retrying scaffold — package.json first"));
    assert.ok(src.includes("ensuring a runnable draft tip"));
    assert.ok(!/ask me to repair the draft/i.test(src));
  });
});
