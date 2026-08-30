const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("canderDesktop", {
  platform: process.platform,
  shellBuild: "2026-08-29-browser-surface",
  shellVersion: "0.1.1",
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
    onEvent: (handler) => {
      const listener = (_event, payload) => handler(payload);
      ipcRenderer.on("cander:browser-event", listener);
      return () => ipcRenderer.removeListener("cander:browser-event", listener);
    },
  },
});
