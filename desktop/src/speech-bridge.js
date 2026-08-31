/**
 * Electron main-process bridge to the macOS SpeechHelper CLI.
 * Streams NDJSON events to the renderer; never uses Chromium Web Speech.
 */

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

/** @type {import('child_process').ChildProcess | null} */
let activeChild = null;
/** @type {((payload: Record<string, unknown>) => void) | null} */
let activeEmit = null;

function resolveHelperPath() {
  const candidates = [
    process.env.CANDER_SPEECH_HELPER,
    path.join(__dirname, "../native/SpeechHelper/SpeechHelper"),
    path.join(process.resourcesPath || "", "SpeechHelper", "SpeechHelper"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      // continue
    }
  }
  return null;
}

function runAvailability() {
  if (process.platform !== "darwin") {
    return Promise.resolve({
      available: false,
      supportsOnDeviceRecognition: false,
      message: "Native speech is only available on macOS.",
    });
  }
  const helper = resolveHelperPath();
  if (!helper) {
    return Promise.resolve({
      available: false,
      supportsOnDeviceRecognition: false,
      message:
        "Desktop Speech helper is not installed. Build desktop/native/SpeechHelper.",
    });
  }

  return new Promise((resolve) => {
    const child = spawn(helper, ["availability"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({
        available: false,
        supportsOnDeviceRecognition: false,
        message: "Speech availability check timed out.",
      });
    }, 12_000);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        available: false,
        supportsOnDeviceRecognition: false,
        message: err.message || "Could not start Speech helper.",
      });
    });
    child.on("close", () => {
      clearTimeout(timer);
      const raw = (stdout || stderr || "").trim();
      try {
        const parsed = JSON.parse(
          raw.split("\n").filter(Boolean).pop() || "{}",
        );
        resolve({
          available: Boolean(parsed.available),
          supportsOnDeviceRecognition: Boolean(
            parsed.supportsOnDeviceRecognition,
          ),
          message: String(parsed.message || ""),
        });
      } catch {
        resolve({
          available: false,
          supportsOnDeviceRecognition: false,
          message: raw || "Speech helper returned unreadable output.",
        });
      }
    });
  });
}

function stopListen() {
  if (!activeChild) return Promise.resolve({ ok: true });
  const child = activeChild;
  activeChild = null;
  try {
    child.stdin?.end();
  } catch {
    // ignore
  }
  try {
    child.kill("SIGTERM");
  } catch {
    // ignore
  }
  return Promise.resolve({ ok: true });
}

function startListen(opts = {}, emit) {
  if (process.platform !== "darwin") {
    return Promise.resolve({
      ok: false,
      message: "Native speech is only available on macOS.",
    });
  }
  const helper = resolveHelperPath();
  if (!helper) {
    return Promise.resolve({
      ok: false,
      message:
        "Desktop Speech helper is not installed. Build desktop/native/SpeechHelper.",
    });
  }

  void stopListen();

  const lang = typeof opts.lang === "string" && opts.lang ? opts.lang : "en-US";
  const child = spawn(helper, ["listen", "--lang", lang], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  activeChild = child;
  activeEmit = typeof emit === "function" ? emit : null;

  let buffer = "";
  child.stdout.on("data", (chunk) => {
    buffer += String(chunk);
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed);
        activeEmit?.(parsed);
      } catch {
        // ignore malformed lines
      }
    }
  });

  child.on("error", (err) => {
    activeEmit?.({
      type: "error",
      message: err.message || "Speech helper failed to start.",
    });
    activeEmit?.({ type: "end" });
    if (activeChild === child) activeChild = null;
  });

  child.on("close", () => {
    if (buffer.trim()) {
      try {
        activeEmit?.(JSON.parse(buffer.trim()));
      } catch {
        // ignore
      }
    }
    activeEmit?.({ type: "end" });
    if (activeChild === child) activeChild = null;
  });

  return Promise.resolve({ ok: true });
}

function bindIpc(ipcMain, getMainWindow) {
  ipcMain.handle("cander:speech-availability", async () => runAvailability());
  ipcMain.handle("cander:speech-start", async (event, opts) => {
    const win = getMainWindow?.() || null;
    return startListen(opts || {}, (payload) => {
      try {
        if (win && !win.isDestroyed()) {
          win.webContents.send("cander:speech-event", payload);
        } else {
          event.sender.send("cander:speech-event", payload);
        }
      } catch {
        // ignore
      }
    });
  });
  ipcMain.handle("cander:speech-stop", async () => stopListen());
}

module.exports = {
  resolveHelperPath,
  runAvailability,
  startListen,
  stopListen,
  bindIpc,
};
