#!/usr/bin/env node
/**
 * macOS dev shell: copy Electron.app → .dev/Cander.app with Cander branding
 * so the Dock shows "Cander" (not "Electron") while developing.
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const desktopRoot = path.join(__dirname, "..");
const electronApp = path.join(
  path.dirname(require.resolve("electron/package.json")),
  "dist/Electron.app",
);
const devApp = path.join(desktopRoot, ".dev/Cander.app");
const plistPath = path.join(devApp, "Contents/Info.plist");
const iconSrc = path.join(desktopRoot, "assets/icon.icns");
const iconDest = path.join(devApp, "Contents/Resources/electron.icns");

const APP_NAME = "Cander";
const BUNDLE_ID = "ai.warix.cander.dev";

function run(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function electronVersionChanged() {
  const stampPath = path.join(desktopRoot, ".dev/.electron-version");
  let version = "";
  try {
    version = require("electron/package.json").version;
  } catch {
    return true;
  }
  if (!fs.existsSync(stampPath)) return true;
  return fs.readFileSync(stampPath, "utf8").trim() !== version;
}

function needsRebuild() {
  if (!fs.existsSync(devApp)) return true;
  if (!fs.existsSync(plistPath)) return true;
  if (electronVersionChanged()) return true;
  try {
    const plist = fs.readFileSync(plistPath, "utf8");
    return !plist.includes(`<string>${APP_NAME}</string>`);
  } catch {
    return true;
  }
}

function ensurePlistString(key, value) {
  if (!fs.existsSync(plistPath)) return;
  const check = spawnSync("/usr/libexec/PlistBuddy", [
    "-c",
    `Print :${key}`,
    plistPath,
  ]);
  if (check.status === 0) {
    run("/usr/libexec/PlistBuddy", ["-c", `Set :${key} ${value}`, plistPath]);
  } else {
    run("/usr/libexec/PlistBuddy", [
      "-c",
      `Add :${key} string ${value}`,
      plistPath,
    ]);
  }
}

function ensurePrivacyPlist() {
  ensurePlistString(
    "NSCameraUsageDescription",
    "Cander uses the camera for in-app browsing and video calls.",
  );
  ensurePlistString(
    "NSMicrophoneUsageDescription",
    "Cander uses the microphone for dictation, voice chat, and in-app browsing.",
  );
  ensurePlistString(
    "NSSpeechRecognitionUsageDescription",
    "Cander turns your speech into text for dictation and voice chat.",
  );
}

if (!fs.existsSync(electronApp)) {
  console.error("Electron.app missing. Run: npm install");
  process.exit(1);
}

if (!needsRebuild()) {
  ensurePrivacyPlist();
  process.exit(0);
}

console.log(`Preparing branded dev app at ${devApp}…`);
fs.mkdirSync(path.join(desktopRoot, ".dev"), { recursive: true });
if (fs.existsSync(devApp)) {
  fs.rmSync(devApp, { recursive: true, force: true });
}

run("ditto", [electronApp, devApp]);

const setPlist = (key, value) => {
  run("/usr/libexec/PlistBuddy", ["-c", `Set :${key} ${value}`, plistPath]);
};

setPlist("CFBundleName", APP_NAME);
setPlist("CFBundleDisplayName", APP_NAME);
setPlist("CFBundleIdentifier", BUNDLE_ID);
setPlist("LSApplicationCategoryType", "public.app-category.productivity");
ensurePrivacyPlist();

if (fs.existsSync(iconSrc)) {
  fs.copyFileSync(iconSrc, iconDest);
}

const version = require("electron/package.json").version;
fs.writeFileSync(path.join(desktopRoot, ".dev/.electron-version"), `${version}\n`);
console.log("Cander dev app ready.");
