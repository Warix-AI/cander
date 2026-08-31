#!/usr/bin/env node
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const helperDir = path.join(__dirname, "../native/SpeechHelper");
const source = path.join(helperDir, "main.swift");
const binary = path.join(helperDir, "SpeechHelper");

if (process.platform !== "darwin") {
  console.log("[cander-desktop] Skipping Speech helper (macOS only).");
  process.exit(0);
}

if (!fs.existsSync(source)) {
  console.error("[cander-desktop] Missing SpeechHelper source.");
  process.exit(1);
}

console.log("[cander-desktop] Building SpeechHelper…");
const result = spawnSync(
  "swiftc",
  [
    "-parse-as-library",
    "-O",
    "-framework",
    "Speech",
    "-framework",
    "AVFoundation",
    "-o",
    binary,
    source,
  ],
  { cwd: helperDir, stdio: "inherit" },
);

if (result.status !== 0) {
  process.exit(result.status || 1);
}

fs.chmodSync(binary, 0o755);
console.log("[cander-desktop] SpeechHelper ready.");
