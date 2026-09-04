const { WebContentsView, session, systemPreferences } = require("electron");
const { partitionFor, isAllowedUrl } = require("./browser-security");
const { PAGE_EXTRACT_SCRIPT, SELECTION_SCRIPT, VIDEO_PIP_INSTALL_SCRIPT, VIDEO_PIP_ENTER_SCRIPT, VIDEO_PIP_EXIT_SCRIPT } = require("./page-extract");

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
/** Tab retained for in-app Picture-in-Picture — never zeroed/destroyed while set. */
let pipTabId = null;

function setHostWindow(win) {
  hostWindow = win;
}

function emitToRenderer(channel, payload) {
  if (!hostWindow || hostWindow.isDestroyed()) return;
  hostWindow.webContents.send(channel, payload);
}

/** Camera / mic / screen share for in-panel browsing (Discord, Meet, etc.). */
function isBrowserMediaPermission(permission) {
  return (
    permission === "media" ||
    permission === "mediaKeySystem" ||
    permission === "display-capture" ||
    permission === "camera" ||
    permission === "microphone"
  );
}

/**
 * Discord calls enumerateDevices / getUserMedia — Chromium will not expose mics
 * until macOS TCC grants the shell access via askForMediaAccess.
 */
function mediaKindsForRequest(permission, details) {
  const kinds = new Set();
  if (permission === "microphone") kinds.add("microphone");
  if (permission === "camera") kinds.add("camera");
  if (permission === "display-capture") kinds.add("screen");
  const mediaTypes = Array.isArray(details?.mediaTypes)
    ? details.mediaTypes
    : [];
  if (mediaTypes.includes("audio")) kinds.add("microphone");
  if (mediaTypes.includes("video")) kinds.add("camera");
  // Bare "media" (device list / unspecified) → request both.
  if (permission === "media" && mediaTypes.length === 0) {
    kinds.add("microphone");
    kinds.add("camera");
  }
  if (permission === "mediaKeySystem") {
    kinds.add("microphone");
    kinds.add("camera");
  }
  return [...kinds];
}

function macMediaGranted(kind) {
  if (process.platform !== "darwin") return true;
  if (kind === "screen") {
    // Screen share uses a different TCC prompt path; don't block mic/cam on it.
    return true;
  }
  try {
    return systemPreferences.getMediaAccessStatus(kind) === "granted";
  } catch {
    return false;
  }
}

async function ensureMacMediaAccess(permission, details) {
  if (process.platform !== "darwin") return true;
  const kinds = mediaKindsForRequest(permission, details).filter(
    (kind) => kind === "microphone" || kind === "camera",
  );
  if (kinds.length === 0) return true;
  for (const kind of kinds) {
    if (macMediaGranted(kind)) continue;
    try {
      const ok = await systemPreferences.askForMediaAccess(kind);
      if (!ok) return false;
    } catch (err) {
      console.warn(`[cander-desktop] askForMediaAccess(${kind}) failed`, err);
      return false;
    }
  }
  return true;
}

function hardenSession(ses) {
  if (ses.__canderBrowserHardened) return;
  ses.__canderBrowserHardened = true;

  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    if (!isBrowserMediaPermission(permission)) {
      callback(false);
      return;
    }
    void ensureMacMediaAccess(permission, details).then((ok) => {
      callback(Boolean(ok));
    });
  });

  // Return false until OS TCC is granted so Chromium issues a real request
  // (which triggers askForMediaAccess). Returning true too early hides devices.
  ses.setPermissionCheckHandler((_wc, permission, _origin, details) => {
    if (!isBrowserMediaPermission(permission)) return false;
    if (process.platform !== "darwin") return true;
    const kinds = mediaKindsForRequest(permission, details);
    if (kinds.length === 0) return true;
    return kinds.every((kind) =>
      kind === "screen" ? true : macMediaGranted(kind),
    );
  });

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
      emitToRenderer("cander:browser-event", {
        type: "openInNewTab",
        tabId,
        url,
      });
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

  wc.on("did-finish-load", () => {
    void wc.executeJavaScript(VIDEO_PIP_INSTALL_SCRIPT, true).catch(() => {});
    if (tabId === pipTabId) {
      void applyVideoPipMode(tabId, true);
    }
  });

  wc.on("media-started-playing", () => {
    void (async () => {
      try {
        await wc.executeJavaScript(VIDEO_PIP_INSTALL_SCRIPT, true);
        const hasVideo = await wc.executeJavaScript(
          "Boolean(window.__canderHasPlayingVideo && window.__canderHasPlayingVideo())",
          true,
        );
        if (!hasVideo) return;
      } catch {
        // Fall through — still notify; enter script no-ops without a video.
      }
      emitToRenderer("cander:browser-event", {
        type: "mediaPlaying",
        tabId,
      });
    })();
  });

  wc.on("media-paused", () => {
    emitToRenderer("cander:browser-event", {
      type: "mediaPaused",
      tabId,
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
      backgroundThrottling: false,
    },
  });
  attachViewListeners(tabId, view);
  applyBrowserUserAgent(view.webContents);
  try {
    view.webContents.setBackgroundThrottling(false);
  } catch {
    // ignore
  }
  try {
    view.setBackgroundColor("#FFFFFF");
  } catch {
    // ignore
  }
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
  // Reuse a live view (PiP retain / remount) — never tear it down.
  if (tabs.has(tabId)) {
    const entry = tabs.get(tabId);
    if (
      initialUrl &&
      isAllowedUrl(initialUrl) &&
      initialUrl !== "about:blank" &&
      entry &&
      entry.lastUrl !== initialUrl &&
      tabId !== pipTabId
    ) {
      entry.lastUrl = initialUrl;
      void entry.view.webContents.loadURL(initialUrl);
    }
    return;
  }
  if (initialUrl && !isAllowedUrl(initialUrl)) {
    emitToRenderer("cander:browser-event", {
      type: "navigationFailed",
      tabId,
      url: initialUrl,
      error: "URL not allowed for local browser surface",
    });
    initialUrl = "about:blank";
  }
  // Warm macOS TCC so Discord can see mics when the page enumerates devices.
  if (!options?.isolatedPartition) {
    void ensureMacMediaAccess("media", { mediaTypes: [] });
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

function destroyTab(tabId, opts = {}) {
  if (tabId === pipTabId && !opts.force) {
    return;
  }
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
  if (pipTabId === tabId) {
    pipTabId = null;
  }
}

function raiseView(entry) {
  if (!entry || !hostWindow || hostWindow.isDestroyed()) return;
  try {
    hostWindow.contentView.removeChildView(entry.view);
    hostWindow.contentView.addChildView(entry.view);
  } catch {
    // ignore
  }
}

async function applyVideoPipMode(tabId, enabled) {
  const entry = tabs.get(tabId);
  if (!entry) return false;
  const wc = entry.view.webContents;
  try {
    await wc.executeJavaScript(VIDEO_PIP_INSTALL_SCRIPT, true);
    if (enabled) {
      return Boolean(await wc.executeJavaScript(VIDEO_PIP_ENTER_SCRIPT, true));
    }
    await wc.executeJavaScript(VIDEO_PIP_EXIT_SCRIPT, true);
    return true;
  } catch (err) {
    console.warn("[cander-desktop] video pip mode failed", err);
    return false;
  }
}

function setPipTab(tabId) {
  const next = tabId ? String(tabId) : null;
  const prev = pipTabId;
  if (prev && prev !== next) {
    void applyVideoPipMode(prev, false);
  }
  pipTabId = next;
  if (pipTabId) {
    const entry = tabs.get(pipTabId);
    if (entry) {
      entry.visible = true;
      try {
        entry.view.webContents.setBackgroundThrottling(false);
      } catch {
        // ignore
      }
      raiseView(entry);
      void applyVideoPipMode(pipTabId, true);
    }
  }
}

function showTab(tabId, bounds) {
  const entry = tabs.get(tabId);
  if (!entry || !hostWindow || hostWindow.isDestroyed()) return;
  // Match host bounds exactly — any bleed spills under the chat/panel divider.
  const nextBounds = {
    x: Math.max(0, Math.round(bounds.x || 0)),
    y: Math.max(0, Math.round(bounds.y || 0)),
    width: Math.max(1, Math.round(bounds.width || 1)),
    height: Math.max(1, Math.round(bounds.height || 1)),
  };
  entry.lastBounds = nextBounds;
  entry.visible = true;
  for (const [id, other] of tabs) {
    if (id === tabId) continue;
    if (id === pipTabId) continue; // Keep PiP floating while panel tab shows.
    other.visible = false;
    other.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  }
  if (chromeOverlay && tabId !== pipTabId) {
    entry.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    return;
  }
  entry.view.setBounds(nextBounds);
  if (tabId === pipTabId) {
    raiseView(entry);
  }
}

function hideTab(tabId) {
  if (tabId === pipTabId) return;
  const entry = tabs.get(tabId);
  if (!entry) return;
  entry.visible = false;
  entry.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
}

/** Collapse all views so React overlays receive clicks (dropdown menus, etc.). */
function setChromeOverlay(active) {
  chromeOverlay = Boolean(active);
  if (chromeOverlay) {
    for (const [id, entry] of tabs) {
      if (id === pipTabId) continue;
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
    if (tabId === pipTabId) continue;
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
  const pip = pipTabId;
  for (const tabId of [...tabs.keys()]) {
    if (tabId === pip) continue;
    destroyTab(tabId, { force: true });
  }
}

/** Reset native surfaces when the shell renderer reloads (Cmd+R). */
function resetForShellReload() {
  chromeOverlay = false;
  pipTabId = null;
  for (const tabId of [...tabs.keys()]) {
    destroyTab(tabId, { force: true });
  }
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
  setPipTab,
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
