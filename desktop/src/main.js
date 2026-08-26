const { app, BrowserWindow, shell, Menu } = require("electron");
const path = require("path");

const APP_NAME = "Cander";
const DEFAULT_URL = "https://cander.app";
const START_URL = process.env.CANDER_URL || DEFAULT_URL;
/** Half the previous inset — only the left chrome sits under traffic lights. */
const TITLEBAR_PX = 22;
/** Approx workspace rail + left menu width for the drag strip. */
const LEFT_DRAG_WIDTH_PX = 320;

/** @type {BrowserWindow | null} */
let mainWindow = null;

function markDesktopShell() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  void mainWindow.webContents.executeJavaScript(`
    document.documentElement.classList.add("cander-desktop");
    document.documentElement.style.setProperty("--desktop-titlebar", "${TITLEBAR_PX}px");
  `);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: APP_NAME,
    backgroundColor: "#ffffff",
    show: false,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 10 },
    icon: path.join(__dirname, "../assets/icon.png"),
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
    // Drag only over the left chrome so main content stays full-bleed and clickable.
    void mainWindow?.webContents.insertCSS(`
      html.cander-desktop {
        --desktop-titlebar: ${TITLEBAR_PX}px !important;
      }
      html.cander-desktop::before {
        content: "";
        position: fixed;
        top: 0;
        left: 0;
        width: ${LEFT_DRAG_WIDTH_PX}px;
        height: ${TITLEBAR_PX}px;
        z-index: 2147483647;
        -webkit-app-region: drag;
      }
      html.cander-desktop body {
        -webkit-app-region: no-drag;
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
