/**
 * Desktop shell extras — Quick Ask, tray, explicit screen capture.
 */

const {
  BrowserWindow,
  globalShortcut,
  Tray,
  Menu,
  desktopCapturer,
  screen,
  nativeImage,
} = require("electron");
const path = require("path");

const ICON_PATH = path.join(__dirname, "../assets/icon.png");

/** @type {BrowserWindow | null} */
let quickAskWindow = null;
/** @type {Tray | null} */
let tray = null;
/** @type {(() => BrowserWindow | null) | null} */
let getMainWindow = null;
/** @type {string} */
let startUrl = "https://cander.app";

function flags() {
  return {
    quickAsk:
      process.env.CANDER_DESKTOP_QUICK_ASK === "1" ||
      process.env.NEXT_PUBLIC_DESKTOP_QUICK_ASK === "1",
    tray:
      process.env.CANDER_DESKTOP_TRAY === "1" ||
      process.env.NEXT_PUBLIC_DESKTOP_TRAY === "1",
  };
}

function init(opts) {
  getMainWindow = opts.getMainWindow;
  startUrl = opts.startUrl || startUrl;
  const f = flags();
  if (f.quickAsk) {
    registerQuickAskShortcut();
  }
  if (f.tray) {
    ensureTray();
  }
}

function registerQuickAskShortcut() {
  try {
    globalShortcut.unregister("Alt+Space");
    globalShortcut.register("Alt+Space", () => {
      void openQuickAsk();
    });
  } catch (e) {
    console.warn("[cander-desktop] shortcut register failed", e);
  }
}

function ensureTray() {
  if (tray) return;
  try {
    const img = nativeImage.createFromPath(ICON_PATH);
    tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img.resize({ width: 16, height: 16 }));
    tray.setToolTip("Cander");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: "New Chat",
          click: () => {
            const main = getMainWindow?.();
            if (main) {
              main.show();
              main.focus();
              main.webContents.send("cander:shell-event", { type: "new-chat" });
            }
          },
        },
        {
          label: "Quick Ask",
          click: () => {
            void openQuickAsk();
          },
        },
        {
          label: "Open Cander",
          click: () => {
            const main = getMainWindow?.();
            main?.show();
            main?.focus();
          },
        },
      ]),
    );
  } catch (e) {
    console.warn("[cander-desktop] tray failed", e);
  }
}

async function openQuickAsk() {
  if (!flags().quickAsk) return { ok: false };
  if (quickAskWindow && !quickAskWindow.isDestroyed()) {
    quickAskWindow.show();
    quickAskWindow.focus();
    return { ok: true };
  }
  const display = screen.getPrimaryDisplay();
  const width = 420;
  const height = 280;
  const x = Math.round(display.workArea.x + (display.workArea.width - width) / 2);
  const y = Math.round(display.workArea.y + display.workArea.height * 0.18);

  quickAskWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    title: "Quick Ask",
    show: false,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: "#ffffff",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const url = `${startUrl.replace(/\/$/, "")}/?quickAsk=1`;
  void quickAskWindow.loadURL(url);
  quickAskWindow.once("ready-to-show", () => quickAskWindow?.show());
  quickAskWindow.on("closed", () => {
    quickAskWindow = null;
  });
  return { ok: true };
}

async function showMainWindow() {
  const main = getMainWindow?.();
  if (!main) return { ok: false };
  main.show();
  main.focus();
  return { ok: true };
}

/**
 * Explicit capture targets only — never continuous monitoring.
 * display | window | browser_viewport (browser handled by browser-surface).
 */
async function captureScreen(opts = {}) {
  const target = opts.target || "display";
  if (target === "browser_viewport") {
    return {
      ok: false,
      message: "Use browser.captureViewport for the Cander browser tab.",
    };
  }

  try {
    const sources = await desktopCapturer.getSources({
      types: target === "window" ? ["window"] : ["screen"],
      thumbnailSize: { width: 1280, height: 720 },
    });
    if (!sources.length) {
      return { ok: false, message: "No capture sources available." };
    }

    let source = sources[0];
    if (target === "window" && sources.length > 1) {
      // Prefer first non-Cander window when possible
      source =
        sources.find((s) => !/cander/i.test(s.name)) || sources[0];
    }

    const png = source.thumbnail.toPNG();
    if (!png?.length) {
      return { ok: false, message: "Empty capture." };
    }
    const dataUrl = `data:image/png;base64,${png.toString("base64")}`;
    return {
      ok: true,
      dataUrl,
      mime: "image/png",
      name: `${target}-capture.png`,
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "capture_failed",
    };
  }
}

function dispose() {
  try {
    globalShortcut.unregisterAll();
  } catch {
    // ignore
  }
  if (tray) {
    tray.destroy();
    tray = null;
  }
  if (quickAskWindow && !quickAskWindow.isDestroyed()) {
    quickAskWindow.close();
  }
}

module.exports = {
  init,
  openQuickAsk,
  showMainWindow,
  captureScreen,
  dispose,
  flags,
};
