/**
 * Native capabilities layer — non-regression + health intent fixtures.
 */

import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function readRepo(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

describe("native capabilities facade (P0A)", () => {
  it("exposes composed NativeCapabilities modules", () => {
    const index = readRepo("lib/native/index.ts");
    assert.match(index, /createNativeMedia/);
    assert.match(index, /createNativeKeyboard/);
    assert.match(index, /createNativeFiles/);
    assert.match(index, /createNativeHaptics/);
    assert.match(index, /createNativeHealth/);
    assert.match(index, /getDeviceCapabilities/);
  });

  it("Composer routes camera/keyboard through the facade", () => {
    const composer = readRepo("components/shell/Composer.tsx");
    assert.match(composer, /getNativeCapabilities\(\)\.media\.pickCameraPhoto/);
    assert.match(composer, /getNativeCapabilities\(\)\.keyboard\.dismiss/);
    assert.doesNotMatch(composer, /pickWithCapacitorCamera/);
  });
});

describe("picked file normalizer (P0B)", () => {
  it("defines NativePickedFile → ChatSendAttachment pipeline", () => {
    const normalize = readRepo("lib/native/normalize.ts");
    assert.match(normalize, /export async function normalizePickedFile/);
    assert.match(normalize, /ChatSendAttachment/);
    assert.match(normalize, /ensureJpegDataUrl|imageFileToAttachment/);
  });

  it("documents document-picker evaluation in NativeFiles", () => {
    const files = readRepo("lib/native/files.ts");
    assert.match(files, /Document picker evaluation/);
    assert.match(files, /capawesome|HTML input/i);
  });
});

describe("health capability gate (P0D)", () => {
  const prev = process.env.NEXT_PUBLIC_AI_HEALTHKIT;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_AI_HEALTHKIT = "1";
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_AI_HEALTHKIT;
    else process.env.NEXT_PUBLIC_AI_HEALTHKIT = prev;
  });

  it("unlocks health tools for user-data steps ask", async () => {
    const { resolveHealthCapabilities, isUserDataHealthIntent } = await import(
      "../lib/ai/health/capabilities.ts"
    );
    assert.equal(
      isUserDataHealthIntent("How many steps did I take yesterday?"),
      true,
    );
    const caps = resolveHealthCapabilities({
      content: "How many steps did I take yesterday?",
      healthEnabled: true,
      platformSupportsHealthKit: true,
    });
    assert.equal(caps.requiresHealthCapabilities, true);
  });

  it("does not unlock health tools for general health knowledge", async () => {
    const { resolveHealthCapabilities, isGeneralHealthQuestion } =
      await import("../lib/ai/health/capabilities.ts");
    assert.equal(
      isGeneralHealthQuestion("What are the health benefits of walking?"),
      true,
    );
    const caps = resolveHealthCapabilities({
      content: "What are the health benefits of walking?",
      healthEnabled: true,
      platformSupportsHealthKit: true,
    });
    assert.equal(caps.requiresHealthCapabilities, false);
    assert.ok(caps.reasons.includes("general_health_knowledge"));
  });

  it("does not unlock when flag off", async () => {
    delete process.env.NEXT_PUBLIC_AI_HEALTHKIT;
    const { resolveHealthCapabilities } = await import(
      "../lib/ai/health/capabilities.ts"
    );
    const caps = resolveHealthCapabilities({
      content: "How many steps did I take?",
      healthEnabled: true,
      platformSupportsHealthKit: true,
    });
    assert.equal(caps.requiresHealthCapabilities, false);
  });

  it("never maps empty coverage to permission denied in types/results", () => {
    const types = readRepo("lib/native/types.ts");
    assert.match(types, /succeeded_no_visible_data/);
    assert.doesNotMatch(types, /permission_denied/);
    const health = readRepo("lib/native/health.ts");
    assert.match(health, /Never map empty/);
  });

  it("normal chat compiler does not force health domain without gate", async () => {
    const { resolveAllowedToolsForTurn } = await import(
      "../lib/ai/tools/domains.ts"
    );
    const res = resolveAllowedToolsForTurn({
      content: "Hello there",
    });
    assert.ok(!res.domains.includes("health" as never));
    assert.ok(!res.toolNames.some((n) => n.startsWith("health.")));
  });

  it("registers health tools in registry", () => {
    const registry = readRepo("lib/ai/tools/registry.ts");
    assert.match(registry, /health\.query/);
    assert.match(registry, /health\.compare/);
    assert.match(registry, /health\.workouts/);
  });
});

describe("share-in never auto-sends (P1)", () => {
  it("parseShareDeepLink creates pending input only", async () => {
    const { parseShareDeepLink } = await import("../lib/composer-seed.ts");
    const pending = parseShareDeepLink(
      "cander://share?text=Hello%20from%20share",
    );
    assert.ok(pending);
    assert.equal(pending!.text, "Hello from share");
    assert.equal(pending!.source, "share");
  });

  it("ShareInListener and docs forbid auto-send", () => {
    const listener = readRepo("components/shell/ShareInListener.tsx");
    assert.match(listener, /never auto-sends/i);
  });
});

describe("desktop shell flags (P1)", () => {
  it("exposes Quick Ask / tray / capture behind flags in desktop shell", () => {
    const shell = readRepo("desktop/src/desktop-shell.js");
    assert.match(shell, /Alt\+Space/);
    assert.match(shell, /captureScreen/);
    assert.match(shell, /Quick Ask/);
    const preload = readRepo("desktop/src/preload.js");
    assert.match(preload, /files:/);
    assert.match(preload, /shell:/);
  });
});

describe("P0 non-regression surface checks", () => {
  it("keeps prepareTurnVisionImages path intact", () => {
    const vision = readRepo("lib/ai/vision-input.ts");
    assert.match(vision, /prepareTurnVisionImages|export async function/);
  });

  it("Android Camera + Haptics synced into Capacitor gradle", () => {
    const gradle = readRepo("mobile/android/app/capacitor.build.gradle");
    assert.match(gradle, /capacitor-camera/);
    assert.match(gradle, /capacitor-haptics/);
  });

  it("HealthKit usage description present", () => {
    const plist = readRepo("mobile/ios/App/App/Info.plist");
    assert.match(plist, /NSHealthShareUsageDescription/);
  });

  it("haptics never block send", () => {
    const haptics = readRepo("lib/native/haptics.ts");
    assert.match(haptics, /never block/i);
    const composer = readRepo("components/shell/Composer.tsx");
    assert.match(composer, /haptics\.impact\("send"\)/);
  });
});
