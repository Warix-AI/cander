const { app, BrowserWindow, shell, Menu } = require("electron");
const path = require("path");

const APP_NAME = "Cander";
const DEFAULT_URL = "https://cander.app";
const START_URL = process.env.CANDER_URL || DEFAULT_URL;
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
    document.documentElement.style.setProperty("--desktop-titlebar", "${TITLEBAR_PX}px");
    document.documentElement.style.setProperty("--desktop-traffic-clear", "${TRAFFIC_CLEAR_PX}px");
  `);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    // Empty title avoids a native unclickable "title text" hit target on macOS.
    title: "",
    backgroundColor: "#ffffff",
    show: false,
    // hiddenInset leaves a native titlebar toolbar that eats clicks in the top
    // ~38–52px. `hidden` + trafficLightPosition is the supported workaround.
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
    // Keep regions opt-in via inline styles in the React shell. Neutralize any
    // leftover drag overlays from older Electron sessions (insertCSS stacks).
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

  // Do not setTitle(APP_NAME) — a non-empty window title recreates a native
  // unclickable hit target in the titlebar on macOS. Menu/Dock use app.setName.
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

  void mainWindow.loadURL(START_URL);

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
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
