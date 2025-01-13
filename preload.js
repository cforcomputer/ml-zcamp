// preload.js
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  saveCampLabel: (camp, isRealCamp) =>
    ipcRenderer.invoke("saveCampLabel", camp, isRealCamp),
  onNewKillmail: (callback) =>
    ipcRenderer.on("newKillmail", (_, data) => callback(data)),
  onInitialData: (callback) =>
    ipcRenderer.on("initialData", (_, data) => callback(data)),
});
