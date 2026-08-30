const { app, BrowserWindow, shell, Menu, session, ipcMain } = require("electron");
const path = require("path");
const foundationModels = require("./foundation-models-bridge");
const browserSurface = require("./browser-surface");

const APP_NAME = "Cander";
const DEFAULT_URL = "https://cander.app";
const FALLBACK_URL = "https://cander.vercel.app";
const START_URL = process.env.CANDER_URL || DEFAULT_URL;
/** Bumped when the native shell changes — visible on <html data-cander-shell>. */
const SHELL_BUILD = "2026-08-30-browser-context-fix";
const ICON_PATH = path.join(__dirname, "../assets/icon.png");
/** Classic Mac titlebar / chrome row height (traffic-light axis). */
const TITLEBAR_PX = 52;
/** Left inset so header controls sit just past custom traffic lights. */
const TRAFFIC_CLEAR_PX = 84;

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {string} */
let activeUrl = START_URL;
let loadAttempts = 0;

function markDesktopShell() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  void mainWindow.webContents.executeJavaScript(`
    document.documentElement.classList.add("cander-desktop");
    document.documentElement.dataset.canderShell = ${JSON.stringify(SHELL_BUILD)};
    document.documentElement.dataset.canderUrl = ${JSON.stringify(activeUrl)};
    document.documentElement.style.setProperty("--desktop-titlebar", "${TITLEBAR_PX}px");
    document.documentElement.style.setProperty("--desktop-traffic-clear", "${TRAFFIC_CLEAR_PX}px");
  `);
}

async function clearWebCache() {
  try {
    const ses = session.defaultSession;
    await ses.clearCache();
    await ses.clearStorageData({
      storages: ["serviceworkers", "cachestorage"],
    });
  } catch (error) {
    console.warn("[cander-desktop] cache clear failed", error);
  }
}

function loadErrorPage(code, desc, failedUrl) {
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Cander</title>
  <style>
    html, body { margin: 0; height: 100%; font-family: ui-sans-serif, system-ui, sans-serif; background: #fafafa; color: #111; }
    body { display: grid; place-items: center; -webkit-app-region: drag; }
    main { max-width: 28rem; padding: 2rem; text-align: center; -webkit-app-region: no-drag; }
    h1 { font-size: 1.25rem; font-weight: 600; margin: 0 0 0.5rem; letter-spacing: -0.02em; }
    p { margin: 0 0 0.75rem; color: #555; font-size: 0.95rem; line-height: 1.45; }
    code { font-size: 0.8rem; color: #333; word-break: break-all; }
    .row { display: flex; gap: 0.5rem; justify-content: center; margin-top: 1.25rem; flex-wrap: wrap; }
    button, a.btn {
      appearance: none; border: 0; border-radius: 999px; padding: 0.65rem 1.1rem;
      font: inherit; font-size: 0.9rem; font-weight: 500; cursor: pointer; text-decoration: none;
    }
    button.primary, a.primary { background: #111; color: #fff; }
    button.secondary, a.secondary { background: #eee; color: #111; }
  </style>
</head>
<body>
  <main>
    <h1>Cander can’t load right now</h1>
    <p>The desktop shell opens the hosted web app. Check your connection, then try again.</p>
    <p><code>${escapeHtml(failedUrl || activeUrl)}</code></p>
    <p><code>${escapeHtml(String(code))} · ${escapeHtml(desc || "load failed")}</code></p>
    <div class="row">
      <button class="primary" id="retry">Try again</button>
      <button class="secondary" id="fallback">Open backup host</button>
      <a class="secondary btn" href="${escapeAttr(DEFAULT_URL)}" target="_blank" rel="noreferrer">Open in browser</a>
    </div>
  </main>
  <script>
    document.getElementById('retry').onclick = () => {
      location.href = ${JSON.stringify(activeUrl)};
    };
    document.getElementById('fallback').onclick = () => {
      location.href = ${JSON.stringify(FALLBACK_URL)};
    };
  </script>
</body>
</html>`;
  void mainWindow?.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

function loadApp(url) {
  activeUrl = url;
  console.log(`[cander-desktop] loading ${url}`);
  void mainWindow?.loadURL(url);
}

async function createWindow() {
  const isMac = process.platform === "darwin";
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: "",
    backgroundColor: "#ffffff",
    show: false,
    // macOS: keep the system traffic lights; hide only the title-bar chrome.
    ...(isMac
      ? {
          titleBarStyle: "hidden",
          trafficLightPosition: { x: 16, y: 18 },
        }
      : {
          frame: true,
        }),
    icon: ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.webContents.on("dom-ready", () => {
    const current = mainWindow?.webContents.getURL() || "";
    if (current.startsWith("data:")) return;
    markDesktopShell();
  });

  // Renderer refresh (Cmd+R) leaves orphaned WebContentsViews / stuck chromeOverlay.
  mainWindow.webContents.on(
    "did-start-navigation",
    (_event, url, _isInPlace, isMainFrame) => {
      if (!isMainFrame) return;
      if (!url || url.startsWith("data:")) return;
      browserSurface.resetForShellReload();
    },
  );

  mainWindow.webContents.on("did-finish-load", () => {
    const current = mainWindow?.webContents.getURL() || "";
    if (current.startsWith("data:")) return;
    loadAttempts = 0;
    browserSurface.setChromeOverlay(false);
    markDesktopShell();
    console.log(
      `[cander-desktop] loaded ${current} (shell ${SHELL_BUILD}, titleBarStyle=hidden)`,
    );
    void mainWindow?.webContents.insertCSS(`
      html.cander-desktop {
        --desktop-titlebar: ${TITLEBAR_PX}px !important;
        --desktop-traffic-clear: ${TRAFFIC_CLEAR_PX}px !important;
      }
      html.cander-desktop nextjs-portal {
        display: none !important;
      }
      html.cander-desktop::before,
      html.cander-desktop::after {
        content: none !important;
        display: none !important;
        pointer-events: none !important;
        -webkit-app-region: no-drag !important;
      }
    `);
  });

  mainWindow.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) return;
      // -3 is ERR_ABORTED (often from a new navigation).
      if (errorCode === -3) return;
      console.error(
        `[cander-desktop] did-fail-load ${errorCode} ${errorDescription} ${validatedURL}`,
      );
      loadAttempts += 1;
      if (loadAttempts === 1) {
        setTimeout(() => loadApp(activeUrl), 900);
        return;
      }
      if (
        loadAttempts === 2 &&
        activeUrl === DEFAULT_URL &&
        !process.env.CANDER_URL
      ) {
        loadApp(FALLBACK_URL);
        return;
      }
      loadErrorPage(errorCode, errorDescription, validatedURL);
    },
  );

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const target = new URL(url);
      const allowed = new Set([
        new URL(DEFAULT_URL).origin,
        new URL(FALLBACK_URL).origin,
        new URL(START_URL).origin,
      ]);
      if (allowed.has(target.origin)) {
        return { action: "allow" };
      }
    } catch {
      // fall through
    }
    void shell.openExternal(url);
    return { action: "deny" };
  });

  if (process.env.CANDER_DEBUG === "1") {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  loadAttempts = 0;
  loadApp(START_URL);

  browserSurface.setHostWindow(mainWindow);

  mainWindow.on("closed", () => {
    browserSurface.destroyAll();
    browserSurface.setHostWindow(null);
    mainWindow = null;
  });
}

function buildMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac
      ? [
          {
            label: APP_NAME,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        {
          label: "Clear Cache and Reload",
          accelerator: "CmdOrCtrl+Shift+R",
          click: () => {
            void (async () => {
              await clearWebCache();
              loadAttempts = 0;
              loadApp(activeUrl || START_URL);
            })();
          },
        },
        { type: "separator" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(isMac
          ? [
              { type: "separator" },
              { role: "front" },
              { type: "separator" },
              { role: "window" },
            ]
          : [{ role: "close" }]),
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  app.setName(APP_NAME);
  if (process.platform === "darwin" && app.dock) {
    app.dock.setIcon(ICON_PATH);
  }

  ipcMain.on("cander:window-minimize", () => {
    mainWindow?.minimize();
  });
  ipcMain.on("cander:window-toggle-maximize", () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.on("cander:window-close", () => {
    mainWindow?.close();
  });

  ipcMain.handle("cander:fm-availability", async () => {
    return foundationModels.getAvailability();
  });
  ipcMain.handle("cander:fm-generate", async (_event, payload) => {
    return foundationModels.generate({
      prompt: payload?.prompt,
      instructions: payload?.instructions,
    });
  });
  ipcMain.handle("cander:fm-generate-structured", async (_event, payload) => {
    return foundationModels.generateStructured({
      prompt: payload?.prompt,
      instructions: payload?.instructions,
    });
  });

  ipcMain.handle("cander:browser-create", async (_e, tabId, url, options) => {
    browserSurface.createTab(tabId, url, options || {});
  });
  ipcMain.handle("cander:browser-destroy", async (_e, tabId) => {
    browserSurface.destroyTab(tabId);
  });
  ipcMain.handle("cander:browser-show", async (_e, tabId, bounds) => {
    browserSurface.showTab(tabId, bounds || {});
  });
  ipcMain.handle("cander:browser-hide", async (_e, tabId) => {
    browserSurface.hideTab(tabId);
  });
  ipcMain.handle("cander:browser-navigate", async (_e, tabId, url) => {
    browserSurface.navigate(tabId, url);
  });
  ipcMain.handle("cander:browser-back", async (_e, tabId) => {
    browserSurface.back(tabId);
  });
  ipcMain.handle("cander:browser-forward", async (_e, tabId) => {
    browserSurface.forward(tabId);
  });
  ipcMain.handle("cander:browser-reload", async (_e, tabId) => {
    browserSurface.reload(tabId);
  });
  ipcMain.handle("cander:browser-stop", async (_e, tabId) => {
    browserSurface.stop(tabId);
  });
  ipcMain.handle("cander:browser-hide-all", async () => {
    browserSurface.hideAll();
  });
  ipcMain.handle("cander:browser-chrome-overlay", async (_e, active) => {
    browserSurface.setChromeOverlay(Boolean(active));
  });
  ipcMain.handle("cander:browser-read-page", async (_e, tabId) => {
    return browserSurface.readPage(tabId);
  });
  ipcMain.handle("cander:browser-get-selection", async (_e, tabId) => {
    return browserSurface.getSelection(tabId);
  });
  ipcMain.handle("cander:browser-capture-viewport", async (_e, tabId) => {
    return browserSurface.captureViewport(tabId);
  });

  buildMenu();
  void createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
