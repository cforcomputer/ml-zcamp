// preload.js
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  getUnlabeledKillmails: () => ipcRenderer.invoke("getUnlabeledKillmails"),
  labelKillmail: (killmailId, isCamp) =>
    ipcRenderer.invoke("labelKillmail", killmailId, isCamp),
  onNewKillmail: (callback) =>
    ipcRenderer.on("newKillmail", (_, data) => callback(data)),
  onInitialData: (callback) =>
    ipcRenderer.on("initialData", (_, data) => callback(data)),
});
