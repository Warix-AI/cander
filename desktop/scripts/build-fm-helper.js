#!/usr/bin/env node
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const helperDir = path.join(__dirname, "../native/FoundationModelsHelper");
const source = path.join(helperDir, "main.swift");
const binary = path.join(helperDir, "FoundationModelsHelper");

if (process.platform !== "darwin") {
  console.log("[cander-desktop] Skipping Foundation Models helper (macOS only).");
  process.exit(0);
}

if (!fs.existsSync(source)) {
  console.error("[cander-desktop] Missing FoundationModelsHelper source.");
  process.exit(1);
}

console.log("[cander-desktop] Building FoundationModelsHelper…");
const result = spawnSync(
  "swiftc",
  ["-parse-as-library", "-O", "-o", binary, source],
  { cwd: helperDir, stdio: "inherit" },
);

if (result.status !== 0) {
  process.exit(result.status || 1);
}

fs.chmodSync(binary, 0o755);
console.log("[cander-desktop] FoundationModelsHelper ready.");
