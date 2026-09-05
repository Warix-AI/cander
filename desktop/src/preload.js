const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("canderDesktop", {
  platform: process.platform,
  shellBuild: "2026-09-04-pip-pointer-passthrough",
  shellVersion: "0.1.15",
  window: {
    minimize: () => ipcRenderer.send("cander:window-minimize"),
    maximize: () => ipcRenderer.send("cander:window-toggle-maximize"),
    close: () => ipcRenderer.send("cander:window-close"),
  },
  foundationModels: {
    getAvailability: () => ipcRenderer.invoke("cander:fm-availability"),
    generate: (opts) => ipcRenderer.invoke("cander:fm-generate", opts),
    generateStructured: (opts) =>
      ipcRenderer.invoke("cander:fm-generate-structured", opts),
  },
  speech: {
    available: () => ipcRenderer.invoke("cander:speech-availability"),
    start: (opts) => ipcRenderer.invoke("cander:speech-start", opts || {}),
    stop: () => ipcRenderer.invoke("cander:speech-stop"),
    onEvent: (handler) => {
      const listener = (_event, payload) => handler(payload);
      ipcRenderer.on("cander:speech-event", listener);
      return () => ipcRenderer.removeListener("cander:speech-event", listener);
    },
  },
  files: {
    showOpenDialog: (opts) =>
      ipcRenderer.invoke("cander:files-open", opts || {}),
    showSaveDialog: (opts) =>
      ipcRenderer.invoke("cander:files-save", opts || {}),
    revealInFolder: (path) =>
      ipcRenderer.invoke("cander:files-reveal", path),
    readDropPaths: (paths) =>
      ipcRenderer.invoke("cander:files-drop", paths || []),
  },
  shell: {
    captureScreen: (opts) =>
      ipcRenderer.invoke("cander:shell-capture", opts || {}),
    openQuickAsk: () => ipcRenderer.invoke("cander:shell-quick-ask"),
    showMainWindow: () => ipcRenderer.invoke("cander:shell-show-main"),
    setTheme: (theme) => ipcRenderer.invoke("cander:shell-set-theme", theme),
    getTheme: () => ipcRenderer.invoke("cander:shell-get-theme"),
    onEvent: (handler) => {
      const listener = (_event, payload) => handler(payload);
      ipcRenderer.on("cander:shell-event", listener);
      return () => ipcRenderer.removeListener("cander:shell-event", listener);
    },
  },
  browser: {
    createTab: (tabId, initialUrl, options) =>
      ipcRenderer.invoke("cander:browser-create", tabId, initialUrl, options),
    destroyTab: (tabId) => ipcRenderer.invoke("cander:browser-destroy", tabId),
    showTab: (tabId, bounds) =>
      ipcRenderer.invoke("cander:browser-show", tabId, bounds),
    hideTab: (tabId) => ipcRenderer.invoke("cander:browser-hide", tabId),
    navigate: (tabId, url) =>
      ipcRenderer.invoke("cander:browser-navigate", tabId, url),
    back: (tabId) => ipcRenderer.invoke("cander:browser-back", tabId),
    forward: (tabId) => ipcRenderer.invoke("cander:browser-forward", tabId),
    reload: (tabId) => ipcRenderer.invoke("cander:browser-reload", tabId),
    stop: (tabId) => ipcRenderer.invoke("cander:browser-stop", tabId),
    hideAll: () => ipcRenderer.invoke("cander:browser-hide-all"),
    setChromeOverlay: (active) =>
      ipcRenderer.invoke("cander:browser-chrome-overlay", active),
    setPipTab: (tabId) =>
      ipcRenderer.invoke("cander:browser-set-pip", tabId ?? null),
    hasPlayingVideo: (tabId) =>
      ipcRenderer.invoke("cander:browser-has-playing-video", tabId),
    pauseMedia: (tabId) =>
      ipcRenderer.invoke("cander:browser-pause-media", tabId),
    isPipCursorHit: () =>
      ipcRenderer.invoke("cander:browser-pip-cursor-hit"),
    setPipPointerPassthrough: (active) =>
      ipcRenderer.invoke("cander:browser-pip-pointer-passthrough", Boolean(active)),
    readPage: (tabId) => ipcRenderer.invoke("cander:browser-read-page", tabId),
    getSelection: (tabId) =>
      ipcRenderer.invoke("cander:browser-get-selection", tabId),
    captureViewport: (tabId) =>
      ipcRenderer.invoke("cander:browser-capture-viewport", tabId),
    onEvent: (handler) => {
      const listener = (_event, payload) => handler(payload);
      ipcRenderer.on("cander:browser-event", listener);
      return () => ipcRenderer.removeListener("cander:browser-event", listener);
    },
  },
});
