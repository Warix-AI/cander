const { WebContentsView, session, systemPreferences } = require("electron");
const { partitionFor, isAllowedUrl } = require("./browser-security");
const {
  PAGE_EXTRACT_SCRIPT,
  SELECTION_SCRIPT,
  VIDEO_PIP_INSTALL_SCRIPT,
  VIDEO_PIP_ENTER_SCRIPT,
  VIDEO_PIP_EXIT_SCRIPT,
  VIDEO_PIP_PAUSE_SCRIPT,
  VIDEO_PIP_CHROME_SCRIPT,
} = require("./page-extract");

/**
 * Local Chromium tab surfaces for the right-panel browser workspace.
 * Ordinary web tabs use a persistent user partition; project previews use isolated ones.
 *
 * Keep partition + URL allow rules aligned with lib/browser-surface/local-browsing.ts.
 */

/** @type {Map<string, { view: import('electron').WebContentsView, lastUrl: string, options: object, lastBounds: { x:number,y:number,width:number,height:number } | null, visible: boolean, partition: string }>} */
const tabs = new Map();

/**
 * Retain Electron Session objects for the app lifetime so cookies / localStorage
 * for persist:cander-web-{userId} survive tab destroy + project switches.
 * @type {Map<string, import('electron').Session>}
 */
const retainedSessions = new Map();

/** @type {import('electron').BrowserWindow | null} */
let hostWindow = null;
/** When React chrome (dropdowns) needs hit-testing over the native view. */
let chromeOverlay = false;
/** Tab retained for in-app Picture-in-Picture — never zeroed/destroyed while set. */
let pipTabId = null;

function setHostWindow(win) {
  hostWindow = win;
  if (!win || win.isDestroyed()) return;
  try {
    win.webContents.on("console-message", (...args) => {
      let message = "";
      if (args[1] && typeof args[1] === "object" && args[1].message != null) {
        message = String(args[1].message);
      } else if (typeof args[2] === "string") {
        message = args[2];
      }
      if (message === "cander-pip:drag-end") endPipDrag();
    });
  } catch {
    // ignore
  }
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

/** One shared Chromium profile per partition for the whole shell lifetime. */
function sessionForPartition(partition) {
  let ses = retainedSessions.get(partition);
  if (!ses) {
    ses = session.fromPartition(partition);
    retainedSessions.set(partition, ses);
  }
  hardenSession(ses);
  return ses;
}

async function flushSessionCookies(ses) {
  if (!ses) return;
  try {
    await ses.cookies.flushStore();
  } catch (err) {
    console.warn("[cander-desktop] cookie flush failed", err);
  }
}

async function flushPartitionCookies(partition) {
  if (!partition) return;
  const ses =
    retainedSessions.get(partition) || session.fromPartition(partition);
  retainedSessions.set(partition, ses);
  await flushSessionCookies(ses);
}

async function flushAllBrowserCookies() {
  for (const ses of retainedSessions.values()) {
    await flushSessionCookies(ses);
  }
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
    const entry = tabs.get(tabId);
    if (entry) entry.lastTitle = String(title || "");
    emitToRenderer("cander:browser-event", {
      type: "title",
      tabId,
      title,
    });
  });

  // Guest PiP chrome (close / expand / drag) — WebContentsView paints over React.
  wc.on("console-message", (...args) => {
    let message = "";
    if (args[0] && typeof args[0] === "object" && args[0].message != null) {
      message = String(args[0].message);
    } else if (args[1] && typeof args[1] === "object" && args[1].message != null) {
      message = String(args[1].message);
    } else if (typeof args[2] === "string") {
      message = args[2];
    } else if (typeof args[1] === "string" && !/^\d+$/.test(args[1])) {
      message = args[1];
    }
    if (!message.startsWith("cander-pip:")) return;
    handlePipChromeConsole(tabId, message);
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
    // Always notify — YouTube / SPAs may not expose a detectable <video> yet.
    void wc.executeJavaScript(VIDEO_PIP_INSTALL_SCRIPT, true).catch(() => {});
    emitToRenderer("cander:browser-event", {
      type: "mediaPlaying",
      tabId,
    });
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
  const ses = sessionForPartition(partition);
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
    // New panel tabs stack on top — pull PiP back above immediately.
    if (tabId !== pipTabId) {
      ensurePipOnTop();
    }
  }
  const url = initialUrl && isAllowedUrl(initialUrl) ? initialUrl : "about:blank";
  if (url) {
    void view.webContents.loadURL(url);
  }
  return { view, partition };
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
  const { view, partition } = createView(
    tabId,
    lastUrl || "about:blank",
    options || {},
  );
  tabs.set(tabId, {
    view,
    lastUrl: lastUrl || "about:blank",
    options: options || {},
    lastBounds: prev?.lastBounds ?? null,
    visible: false,
    partition,
  });
}

function urlsMatch(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  try {
    return new URL(a).href === new URL(b).href;
  } catch {
    return false;
  }
}

function createTab(tabId, initialUrl, options = {}) {
  if (!hostWindow || hostWindow.isDestroyed()) {
    throw new Error("No host window for browser surface.");
  }
  // Reuse a live view (tab switch / PiP) — never tear it down or reload here.
  if (tabs.has(tabId)) {
    return;
  }
  if (
    !options?.isolatedPartition &&
    !String(options?.userId || "").trim()
  ) {
    throw new Error(
      "userId required for shared browser cookies (persist:cander-web-{userId}).",
    );
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
  const { view, partition } = createView(tabId, initialUrl, options);
  tabs.set(tabId, {
    view,
    lastUrl: initialUrl || "about:blank",
    options,
    lastBounds: null,
    visible: false,
    partition,
  });
}

function destroyTab(tabId, opts = {}) {
  if (tabId === pipTabId && !opts.force) {
    return;
  }
  const entry = tabs.get(tabId);
  if (!entry) return;
  // Persist cookies before tearing down the last views for this jar.
  if (entry.partition && !entry.options?.isolatedPartition) {
    void flushPartitionCookies(entry.partition);
  }
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

/** Keep the floating PiP view above panel tabs without thrashing on every paint. */
function ensurePipOnTop() {
  if (!pipTabId) return;
  const entry = tabs.get(pipTabId);
  if (!entry) return;
  raiseView(entry);
}

async function applyVideoPipMode(tabId, enabled) {
  const entry = tabs.get(tabId);
  if (!entry) return false;
  const wc = entry.view.webContents;
  try {
    await wc.executeJavaScript(VIDEO_PIP_INSTALL_SCRIPT, true);
    if (enabled) {
      // YouTube / SPA players may mount <video> a beat after media-started-playing.
      for (let i = 0; i < 6; i++) {
        const ok = Boolean(
          await wc.executeJavaScript(VIDEO_PIP_ENTER_SCRIPT, true),
        );
        if (ok) return true;
        await new Promise((r) => setTimeout(r, 150));
      }
      return false;
    }
    await wc.executeJavaScript(VIDEO_PIP_EXIT_SCRIPT, true);
    return true;
  } catch (err) {
    console.warn("[cander-desktop] video pip mode failed", err);
    return false;
  }
}

async function hasPlayingVideo(tabId) {
  const entry = tabs.get(tabId);
  if (!entry) return false;
  const wc = entry.view.webContents;
  try {
    // Audible is more reliable than DOM <video> for YouTube / SPA players,
    // especially right as focus leaves the tab.
    if (typeof wc.isCurrentlyAudible === "function" && wc.isCurrentlyAudible()) {
      return true;
    }
    await wc.executeJavaScript(VIDEO_PIP_INSTALL_SCRIPT, true);
    return Boolean(
      await wc.executeJavaScript(
        "Boolean(window.__canderHasPlayingVideo && window.__canderHasPlayingVideo())",
        true,
      ),
    );
  } catch {
    return false;
  }
}

async function pauseMedia(tabId) {
  const entry = tabs.get(tabId);
  if (!entry) return false;
  const wc = entry.view.webContents;
  try {
    return Boolean(await wc.executeJavaScript(VIDEO_PIP_PAUSE_SCRIPT, true));
  } catch (err) {
    console.warn("[cander-desktop] pauseMedia failed", err);
    return false;
  }
}

async function setPipTab(tabId) {
  const next = tabId ? String(tabId) : null;
  const prev = pipTabId;
  if (prev && prev !== next) {
    await applyVideoPipMode(prev, false);
  }
  pipTabId = next;
  if (!pipTabId) {
    endPipDrag();
    stopPipCmdPoll();
    setPipPointerPassthrough(false);
  }
  if (pipTabId) {
    ensurePipCmdPoll();
    const entry = tabs.get(pipTabId);
    if (entry) {
      entry.visible = true;
      try {
        entry.view.webContents.setBackgroundThrottling(false);
      } catch {
        // ignore
      }
      raiseView(entry);
      await applyVideoPipMode(pipTabId, true);
    }
  }
}

/** Last non-PiP tab shown in the panel — restored if a PiP paint blanked it. */
let activePanelTabId = null;

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
  const prev = entry.lastBounds;
  const unchanged =
    entry.visible &&
    prev &&
    prev.x === nextBounds.x &&
    prev.y === nextBounds.y &&
    prev.width === nextBounds.width &&
    prev.height === nextBounds.height;
  entry.lastBounds = nextBounds;
  entry.visible = true;

  // PiP paints must NEVER hide the active panel tab — that blanked the browser
  // whenever the floating video moved or hovered.
  if (tabId === pipTabId) {
    // Main-process screen poll owns bounds while dragging.
    if (pipDragState) return;
    if (!unchanged) {
      entry.view.setBounds(nextBounds);
      raiseView(entry);
    } else {
      ensurePipOnTop();
    }
    return;
  }

  activePanelTabId = tabId;
  for (const [id, other] of tabs) {
    if (id === tabId) continue;
    if (id === pipTabId) continue; // Keep PiP floating while panel tab shows.
    if (!other.visible && other.lastBounds && other.lastBounds.width === 0) {
      continue;
    }
    const wasVisible = other.visible;
    other.visible = false;
    other.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    // Background tabs must stay paused (no surprise resume on return).
    if (wasVisible) {
      void pauseMedia(id);
    }
  }
  // Only chrome overlays (menus) should zero the panel tab.
  if (chromeOverlay) {
    entry.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    ensurePipOnTop();
    return;
  }
  if (!unchanged) {
    entry.view.setBounds(nextBounds);
  }
  // Panel tab moved/shown — keep PiP above it (once per real change).
  if (!unchanged) {
    ensurePipOnTop();
  }
}

/** Re-show the panel tab if a prior PiP paint collapsed it. */
function restoreActivePanelIfNeeded() {
  if (!activePanelTabId || activePanelTabId === pipTabId) return;
  if (chromeOverlay) return;
  const panel = tabs.get(activePanelTabId);
  if (!panel?.lastBounds || panel.lastBounds.width < 2) return;
  panel.visible = true;
  panel.view.setBounds(panel.lastBounds);
  ensurePipOnTop();
}

function isCursorOverPip() {
  if (pipDragState) return true;
  if (!pipTabId || !hostWindow || hostWindow.isDestroyed()) return false;
  const entry = tabs.get(pipTabId);
  if (!entry?.lastBounds || !entry.visible) return false;
  const { screen } = require("electron");
  const point = screen.getCursorScreenPoint();
  const content = hostWindow.getContentBounds();
  const x = point.x - content.x;
  const y = point.y - content.y;
  const b = entry.lastBounds;
  // Include a header strip above the video so hover chrome stays hittable.
  const HEADER = 36;
  return (
    x >= b.x &&
    x <= b.x + b.width &&
    y >= b.y - HEADER &&
    y <= b.y + b.height
  );
}

/**
 * WebContentsView has no setIgnoreMouseEvents — React PiP chrome cannot receive
 * clicks over the native surface. Instead of collapsing panel tabs (which blanked
 * the browser), inject in-guest chrome when the cursor is over PiP.
 */
let pipPointerPassthrough = false;
/** @type {{ tabId: string, startScreenX: number, startScreenY: number, origX: number, origY: number } | null} */
let pipDragState = null;
/** @type {ReturnType<typeof setInterval> | null} */
let pipDragPoll = null;
/** @type {ReturnType<typeof setInterval> | null} */
let pipCmdPoll = null;

function stopPipCmdPoll() {
  if (pipCmdPoll) {
    clearInterval(pipCmdPoll);
    pipCmdPoll = null;
  }
}

async function pollPipGuestCommand() {
  if (!pipTabId) return;
  const entry = tabs.get(pipTabId);
  if (!entry) return;
  try {
    const raw = await entry.view.webContents.executeJavaScript(
      `(() => {
        const v = document.documentElement.getAttribute('data-cander-pip-cmd');
        if (v) document.documentElement.removeAttribute('data-cander-pip-cmd');
        return v || '';
      })()`,
      true,
    );
    if (!raw || typeof raw !== "string") return;
    const message = raw.split("|")[0] || "";
    if (message.startsWith("cander-pip:")) {
      handlePipChromeConsole(pipTabId, message);
    }
  } catch {
    // ignore
  }
}

function ensurePipCmdPoll() {
  if (pipCmdPoll || !pipTabId) return;
  pipCmdPoll = setInterval(() => {
    void pollPipGuestCommand();
  }, 50);
}

function chromePadPx() {
  return pipPointerPassthrough || pipDragState ? 36 : 0;
}

function videoPosFromBounds(bounds) {
  return {
    x: bounds.x,
    y: bounds.y + chromePadPx(),
  };
}

function stopPipDragPoll() {
  if (pipDragPoll) {
    clearInterval(pipDragPoll);
    pipDragPoll = null;
  }
}

function applyPipDragAtScreen(screenX, screenY) {
  if (!pipDragState || !pipTabId) return;
  const entry = tabs.get(pipDragState.tabId);
  if (!entry?.lastBounds) return;
  const dx = screenX - pipDragState.startScreenX;
  const dy = screenY - pipDragState.startScreenY;
  const next = {
    ...entry.lastBounds,
    x: Math.max(0, Math.round(pipDragState.origX + dx)),
    y: Math.max(0, Math.round(pipDragState.origY + dy)),
  };
  entry.lastBounds = next;
  entry.view.setBounds(next);
  const video = videoPosFromBounds(next);
  emitToRenderer("cander:browser-event", {
    type: "pipMove",
    tabId: pipDragState.tabId,
    x: video.x,
    y: video.y,
  });
}

function endPipDrag() {
  if (!pipDragState) return;
  const entry = tabs.get(pipDragState.tabId);
  const tabId = pipDragState.tabId;
  stopPipDragPoll();
  pipDragState = null;
  const video = entry?.lastBounds
    ? videoPosFromBounds(entry.lastBounds)
    : { x: 0, y: 0 };
  emitToRenderer("cander:browser-event", {
    type: "pipDragEnd",
    tabId,
    x: video.x,
    y: video.y,
  });
}

function armPipDragMouseUp() {
  const script = `(() => {
    const once = () => {
      console.log('cander-pip:drag-end');
      window.removeEventListener('mouseup', once, true);
    };
    window.addEventListener('mouseup', once, true);
    return true;
  })()`;
  for (const [, entry] of tabs) {
    try {
      void entry.view.webContents.executeJavaScript(script, true).catch(() => {});
    } catch {
      // ignore
    }
  }
  if (hostWindow && !hostWindow.isDestroyed()) {
    try {
      void hostWindow.webContents.executeJavaScript(script, true).catch(() => {});
    } catch {
      // ignore
    }
  }
}

function startPipDrag(tabId, screenX, screenY) {
  const entry = tabs.get(tabId);
  if (!entry?.lastBounds) return;
  stopPipDragPoll();
  pipDragState = {
    tabId,
    startScreenX: screenX,
    startScreenY: screenY,
    origX: entry.lastBounds.x,
    origY: entry.lastBounds.y,
  };
  emitToRenderer("cander:browser-event", { type: "pipDragStart", tabId });
  // Keep guest chrome visible for the whole drag.
  if (!pipPointerPassthrough) {
    pipPointerPassthrough = true;
    const title = entry.lastTitle || "Video";
    void entry.view.webContents
      .executeJavaScript(VIDEO_PIP_INSTALL_SCRIPT, true)
      .then(() =>
        entry.view.webContents.executeJavaScript(
          VIDEO_PIP_CHROME_SCRIPT(true, title),
          true,
        ),
      )
      .catch(() => {});
  }
  armPipDragMouseUp();
  const { screen } = require("electron");
  pipDragPoll = setInterval(() => {
    if (!pipDragState) {
      stopPipDragPoll();
      return;
    }
    const point = screen.getCursorScreenPoint();
    applyPipDragAtScreen(point.x, point.y);
  }, 16);
}

function handlePipChromeConsole(tabId, message) {
  if (message === "cander-pip:drag-end") {
    endPipDrag();
    return;
  }
  if (tabId !== pipTabId) return;
  if (message === "cander-pip:close") {
    endPipDrag();
    emitToRenderer("cander:browser-event", { type: "pipClose", tabId });
    return;
  }
  if (message === "cander-pip:expand") {
    endPipDrag();
    emitToRenderer("cander:browser-event", { type: "pipReturn", tabId });
    return;
  }
  if (message.startsWith("cander-pip:drag-start:")) {
    const coords = message.slice("cander-pip:drag-start:".length).split(",");
    const sx = Number(coords[0]);
    const sy = Number(coords[1]);
    if (!Number.isFinite(sx) || !Number.isFinite(sy)) return;
    startPipDrag(tabId, sx, sy);
    return;
  }
}

function setPipPointerPassthrough(active) {
  // Keep chrome + drag alive while the user is dragging the PiP.
  if (pipDragState && !active) return;
  const next = Boolean(active);
  if (pipPointerPassthrough === next) return;
  pipPointerPassthrough = next;
  const entry = pipTabId ? tabs.get(pipTabId) : null;
  if (entry) {
    const title = entry.lastTitle || "Video";
    void entry.view.webContents
      .executeJavaScript(VIDEO_PIP_INSTALL_SCRIPT, true)
      .then(() =>
        entry.view.webContents.executeJavaScript(
          VIDEO_PIP_CHROME_SCRIPT(next, title),
          true,
        ),
      )
      .catch((err) => {
        console.warn("[cander-desktop] pip guest chrome failed", err);
      });
  }
  if (next) ensurePipCmdPoll();
  else if (!pipDragState) stopPipCmdPoll();
  restoreActivePanelIfNeeded();
  ensurePipOnTop();
}

function hideTab(tabId) {
  if (tabId === pipTabId) return;
  const entry = tabs.get(tabId);
  if (!entry) return;
  entry.visible = false;
  entry.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  if (activePanelTabId === tabId) activePanelTabId = null;
  // Keep background tabs paused — Chromium often auto-resumes when shown again.
  void pauseMedia(tabId);
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
  ensurePipOnTop();
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
  let current = entry.lastUrl;
  try {
    current = entry.view.webContents.getURL() || current;
  } catch {
    // ignore
  }
  // Remounting a retained tab must not reload (YouTube / live media).
  if (urlsMatch(current, url)) return;
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
  void flushAllBrowserCookies();
}

/** Reset native surfaces when the shell renderer reloads (Cmd+R). */
function resetForShellReload() {
  chromeOverlay = false;
  pipTabId = null;
  for (const tabId of [...tabs.keys()]) {
    destroyTab(tabId, { force: true });
  }
  void flushAllBrowserCookies();
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
  hasPlayingVideo,
  pauseMedia,
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
  flushAllBrowserCookies,
  isCursorOverPip,
  setPipPointerPassthrough,
  readPage,
  getSelection,
  captureViewport,
};
