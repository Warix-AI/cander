const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("canderDesktop", {
  platform: process.platform,
  window: {
    minimize: () => ipcRenderer.send("cander:window-minimize"),
    maximize: () => ipcRenderer.send("cander:window-toggle-maximize"),
    close: () => ipcRenderer.send("cander:window-close"),
  },
  foundationModels: {
    getAvailability: () => ipcRenderer.invoke("cander:fm-availability"),
    generate: (opts) => ipcRenderer.invoke("cander:fm-generate", opts),
  },
});
