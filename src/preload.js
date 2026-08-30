const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("eyeProtect", {
  getState: () => ipcRenderer.invoke("timer:get-state"),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  updateSettings: (settings) => ipcRenderer.invoke("settings:update", settings),
  command: (command) => ipcRenderer.invoke("timer:command", command),
  showMainWindow: () => ipcRenderer.invoke("window:show-main"),
  hideReminder: () => ipcRenderer.invoke("window:hide-reminder"),
  setSettingsOpen: (open) => ipcRenderer.invoke("window:set-settings-open", Boolean(open)),
  onStateChanged: (listener) => {
    const handler = (_event, state) => listener(state);
    ipcRenderer.on("timer:state", handler);
    return () => ipcRenderer.removeListener("timer:state", handler);
  },
});
