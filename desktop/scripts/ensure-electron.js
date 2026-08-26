#!/usr/bin/env node
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const electronDir = path.dirname(require.resolve("electron/package.json"));
const dist = path.join(electronDir, "dist");
const binary = path.join(dist, "Electron.app/Contents/MacOS/Electron");
const pathFile = path.join(electronDir, "path.txt");

if (fs.existsSync(binary) && fs.existsSync(pathFile)) {
  process.exit(0);
}

console.log("Installing Electron binary…");
const install = spawnSync(process.execPath, [path.join(electronDir, "install.js")], {
  stdio: "inherit",
  env: { ...process.env },
});
if (install.status !== 0) process.exit(install.status || 1);

if (!fs.existsSync(binary)) {
  // Prefer ditto so macOS symlinks in the .app stay intact
  const cacheRoot = path.join(require("os").homedir(), "Library/Caches/electron");
  console.error("Electron binary missing after install. Try: rm -rf node_modules && npm install");
  process.exit(1);
}

fs.writeFileSync(pathFile, "Electron.app/Contents/MacOS/Electron");
console.log("Electron ready.");
