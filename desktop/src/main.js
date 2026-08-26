const { app, BrowserWindow, shell, Menu, session } = require("electron");
const path = require("path");

const APP_NAME = "Cander";
const DEFAULT_URL = "https://cander.app";
const START_URL = process.env.CANDER_URL || DEFAULT_URL;
/** Bumped when the native shell changes — visible on <html data-cander-shell>. */
const SHELL_BUILD = "2026-08-25-hidden-titlebar";
const ICON_PATH = path.join(__dirname, "../assets/icon.png");
/** Classic Mac titlebar / chrome row height (traffic-light axis). */
const TITLEBAR_PX = 52;
/** Left inset so header controls sit just past the traffic lights. */
const TRAFFIC_CLEAR_PX = 80;

/** @type {BrowserWindow | null} */
let mainWindow = null;

function markDesktopShell() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  void mainWindow.webContents.executeJavaScript(`
    document.documentElement.classList.add("cander-desktop");
    document.documentElement.dataset.canderShell = ${JSON.stringify(SHELL_BUILD)};
    document.documentElement.dataset.canderUrl = ${JSON.stringify(START_URL)};
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

async function createWindow() {
  await clearWebCache();

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: "",
    backgroundColor: "#ffffff",
    show: false,
    // hiddenInset leaves a native titlebar hit-target that eats top-row clicks.
    titleBarStyle: "hidden",
    trafficLightPosition: { x: 16, y: 18 },
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
    markDesktopShell();
  });

  mainWindow.webContents.on("did-finish-load", () => {
    markDesktopShell();
    console.log(
      `[cander-desktop] loaded ${START_URL} (shell ${SHELL_BUILD}, titleBarStyle=hidden)`,
    );
    void mainWindow?.webContents.insertCSS(`
      html.cander-desktop {
        --desktop-titlebar: ${TITLEBAR_PX}px !important;
        --desktop-traffic-clear: ${TRAFFIC_CLEAR_PX}px !important;
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

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const target = new URL(url);
      const appOrigin = new URL(START_URL).origin;
      if (target.origin === appOrigin) {
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

  void mainWindow.loadURL(START_URL, {
    extraHeaders: "Cache-Control: no-cache\nPragma: no-cache\n",
  });

  mainWindow.on("closed", () => {
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
              mainWindow?.webContents.reloadIgnoringCache();
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
