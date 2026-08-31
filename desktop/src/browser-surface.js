const { WebContentsView, session, shell } = require("electron");
const { partitionFor, isAllowedUrl } = require("./browser-security");
const { PAGE_EXTRACT_SCRIPT, SELECTION_SCRIPT } = require("./page-extract");

/**
 * Local Chromium tab surfaces for the right-panel browser workspace.
 * Ordinary web tabs use a persistent user partition; project previews use isolated ones.
 *
 * Keep partition + URL allow rules aligned with lib/browser-surface/local-browsing.ts.
 */

/** @type {Map<string, { view: import('electron').WebContentsView, lastUrl: string, options: object, lastBounds: { x:number,y:number,width:number,height:number } | null, visible: boolean }>} */
const tabs = new Map();

/** @type {import('electron').BrowserWindow | null} */
let hostWindow = null;
/** When React chrome (dropdowns) needs hit-testing over the native view. */
let chromeOverlay = false;

function setHostWindow(win) {
  hostWindow = win;
}

function emitToRenderer(channel, payload) {
  if (!hostWindow || hostWindow.isDestroyed()) return;
  hostWindow.webContents.send(channel, payload);
}

function hardenSession(ses) {
  if (ses.__canderBrowserHardened) return;
  ses.__canderBrowserHardened = true;

  ses.setPermissionRequestHandler((_wc, _permission, callback) => {
    callback(false);
  });

  ses.setPermissionCheckHandler(() => false);

  ses.on("will-download", (event) => {
    event.preventDefault();
  });
}

/** Sites flag Electron's default UA as automation — present as desktop Chrome. */
function applyBrowserUserAgent(wc) {
  const raw = wc.getUserAgent();
  const cleaned = raw
    .replace(/\sElectron\/[^\s]+/g, "")
    .replace(/\sCander\/[^\s]+/g, "")
    .trim();
  if (cleaned && cleaned !== raw) {
    wc.setUserAgent(cleaned);
  }
}

function attachViewListeners(tabId, view) {
  const wc = view.webContents;

  wc.setWindowOpenHandler(({ url }) => {
    if (isAllowedUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  wc.on("will-navigate", (event, url) => {
    if (!isAllowedUrl(url)) {
      event.preventDefault();
      emitToRenderer("cander:browser-event", {
        type: "navigationFailed",
        tabId,
        url,
        error: "Navigation blocked by security policy",
      });
    }
  });

  wc.on("page-title-updated", (_e, title) => {
    emitToRenderer("cander:browser-event", {
      type: "title",
      tabId,
      title,
    });
  });

  wc.on("page-favicon-updated", (_e, favicons) => {
    emitToRenderer("cander:browser-event", {
      type: "favicon",
      tabId,
      faviconUrl: favicons?.[0] || null,
    });
  });

  wc.on("did-navigate", (_e, url) => {
    const entry = tabs.get(tabId);
    if (entry) entry.lastUrl = url;
    emitToRenderer("cander:browser-event", { type: "url", tabId, url });
  });

  wc.on("did-navigate-in-page", (_e, url) => {
    const entry = tabs.get(tabId);
    if (entry) entry.lastUrl = url;
    emitToRenderer("cander:browser-event", { type: "url", tabId, url });
  });

  wc.on("did-start-loading", () => {
    emitToRenderer("cander:browser-event", {
      type: "loading",
      tabId,
      loading: true,
    });
  });

  wc.on("did-stop-loading", () => {
    emitToRenderer("cander:browser-event", {
      type: "loading",
      tabId,
      loading: false,
    });
  });

  wc.on("did-fail-load", (_e, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return;
    emitToRenderer("cander:browser-event", {
      type: "navigationFailed",
      tabId,
      url,
      error: `${code} ${desc}`,
    });
  });

  wc.on("render-process-gone", (_e, details) => {
    emitToRenderer("cander:browser-event", {
      type: "processGone",
      tabId,
      reason: details?.reason || "unknown",
    });
    // Recover the surface and reload the last URL.
    const entry = tabs.get(tabId);
    if (!entry) return;
    const { lastUrl, options } = entry;
    try {
      recoverTab(tabId, lastUrl, options);
    } catch (err) {
      console.warn("[cander-desktop] browser crash recovery failed", err);
    }
  });
}

function createView(tabId, initialUrl, options) {
  const partition = partitionFor(options);
  const ses = session.fromPartition(partition);
  hardenSession(ses);
  const view = new WebContentsView({
    webPreferences: {
      session: ses,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      navigateOnDragDrop: false,
    },
  });
  attachViewListeners(tabId, view);
  applyBrowserUserAgent(view.webContents);
  view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  if (hostWindow && !hostWindow.isDestroyed()) {
    hostWindow.contentView.addChildView(view);
  }
  const url = initialUrl && isAllowedUrl(initialUrl) ? initialUrl : "about:blank";
  if (url) {
    void view.webContents.loadURL(url);
  }
  return view;
}

function recoverTab(tabId, lastUrl, options) {
  const prev = tabs.get(tabId);
  if (prev?.view) {
    try {
      if (hostWindow && !hostWindow.isDestroyed()) {
        hostWindow.contentView.removeChildView(prev.view);
      }
    } catch {
      // ignore
    }
    try {
      prev.view.webContents.close();
    } catch {
      // ignore
    }
  }
  const view = createView(tabId, lastUrl || "about:blank", options || {});
  tabs.set(tabId, {
    view,
    lastUrl: lastUrl || "about:blank",
    options: options || {},
    lastBounds: prev?.lastBounds ?? null,
    visible: false,
  });
}

function createTab(tabId, initialUrl, options = {}) {
  if (!hostWindow || hostWindow.isDestroyed()) {
    throw new Error("No host window for browser surface.");
  }
  destroyTab(tabId);
  if (initialUrl && !isAllowedUrl(initialUrl)) {
    emitToRenderer("cander:browser-event", {
      type: "navigationFailed",
      tabId,
      url: initialUrl,
      error: "URL not allowed for local browser surface",
    });
    initialUrl = "about:blank";
  }
  const view = createView(tabId, initialUrl, options);
  tabs.set(tabId, {
    view,
    lastUrl: initialUrl || "about:blank",
    options,
    lastBounds: null,
    visible: false,
  });
}

function destroyTab(tabId) {
  const entry = tabs.get(tabId);
  if (!entry) return;
  try {
    if (hostWindow && !hostWindow.isDestroyed()) {
      hostWindow.contentView.removeChildView(entry.view);
    }
  } catch {
    // ignore
  }
  try {
    entry.view.webContents.close();
  } catch {
    // ignore
  }
  tabs.delete(tabId);
}

function showTab(tabId, bounds) {
  const entry = tabs.get(tabId);
  if (!entry || !hostWindow || hostWindow.isDestroyed()) return;
  const nextBounds = {
    x: Math.max(0, Math.floor(bounds.x || 0)),
    y: Math.max(0, Math.floor(bounds.y || 0)),
    width: Math.max(1, Math.ceil(bounds.width || 1)),
    height: Math.max(1, Math.ceil(bounds.height || 1)),
  };
  entry.lastBounds = nextBounds;
  entry.visible = true;
  for (const [id, other] of tabs) {
    if (id === tabId) continue;
    other.visible = false;
    other.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  }
  if (chromeOverlay) {
    entry.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    return;
  }
  entry.view.setBounds(nextBounds);
}

function hideTab(tabId) {
  const entry = tabs.get(tabId);
  if (!entry) return;
  entry.visible = false;
  entry.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
}

/** Collapse all views so React overlays receive clicks (dropdown menus, etc.). */
function setChromeOverlay(active) {
  chromeOverlay = Boolean(active);
  if (chromeOverlay) {
    for (const entry of tabs.values()) {
      entry.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    }
    return;
  }
  for (const entry of tabs.values()) {
    if (entry.visible && entry.lastBounds) {
      entry.view.setBounds(entry.lastBounds);
    }
  }
}

function hideAll() {
  for (const tabId of tabs.keys()) {
    hideTab(tabId);
  }
}

function navigate(tabId, url) {
  const entry = tabs.get(tabId);
  if (!entry) return;
  if (!isAllowedUrl(url)) {
    emitToRenderer("cander:browser-event", {
      type: "navigationFailed",
      tabId,
      url,
      error: "URL not allowed for local browser surface",
    });
    return;
  }
  entry.lastUrl = url;
  void entry.view.webContents.loadURL(url);
}

function back(tabId) {
  const wc = tabs.get(tabId)?.view.webContents;
  if (wc?.canGoBack()) wc.goBack();
}

function forward(tabId) {
  const wc = tabs.get(tabId)?.view.webContents;
  if (wc?.canGoForward()) wc.goForward();
}

function reload(tabId) {
  tabs.get(tabId)?.view.webContents.reload();
}

function stop(tabId) {
  tabs.get(tabId)?.view.webContents.stop();
}

function destroyAll() {
  chromeOverlay = false;
  for (const tabId of [...tabs.keys()]) {
    destroyTab(tabId);
  }
}

/** Reset native surfaces when the shell renderer reloads (Cmd+R). */
function resetForShellReload() {
  chromeOverlay = false;
  destroyAll();
}

async function readPage(tabId) {
  const entry = tabs.get(tabId);
  if (!entry) throw new Error("Unknown browser tab");
  const result = await entry.view.webContents.executeJavaScript(
    PAGE_EXTRACT_SCRIPT,
    true,
  );
  return result || {};
}

async function getSelection(tabId) {
  const entry = tabs.get(tabId);
  if (!entry) throw new Error("Unknown browser tab");
  const result = await entry.view.webContents.executeJavaScript(
    SELECTION_SCRIPT,
    true,
  );
  return result || { text: "", url: entry.lastUrl };
}

async function captureViewport(tabId) {
  const entry = tabs.get(tabId);
  if (!entry) throw new Error("Unknown browser tab");
  const image = await entry.view.webContents.capturePage();
  const size = image.getSize();
  let out = image;
  const maxW = 1280;
  if (size.width > maxW) {
    out = image.resize({ width: maxW });
  }
  const jpeg = out.toJPEG(72);
  const finalSize = out.getSize();
  return {
    dataBase64: jpeg.toString("base64"),
    mimeType: "image/jpeg",
    width: finalSize.width,
    height: finalSize.height,
  };
}

module.exports = {
  setHostWindow,
  createTab,
  destroyTab,
  showTab,
  hideTab,
  hideAll,
  setChromeOverlay,
  navigate,
  back,
  forward,
  reload,
  stop,
  destroyAll,
  resetForShellReload,
  readPage,
  getSelection,
  captureViewport,
};
