import { contextBridge, ipcRenderer } from "electron";
const events = ["snapshot", "bubble", "drag-motion", "view"];
contextBridge.exposeInMainWorld("naiwa", {
  snapshot: () => ipcRenderer.invoke("snapshot"),
  settings: (p: any) => ipcRenderer.invoke("settings", p),
  refresh: () => ipcRenderer.invoke("refresh"),
  login: () => ipcRenderer.invoke("login"),
  send: (name: string, data: any) => {
    if (
      [
        "panel",
        "context",
        "hit",
        "drag-start",
        "drag-stop",
        "pause",
        "resume-reminders",
        "snooze",
        "hide",
        "online",
        "test-reminder",
      ].includes(name)
    )
      ipcRenderer.send(name, data);
  },
  on: (name: string, callback: (data: any) => void) => {
    if (!events.includes(name)) return () => {};
    const listener = (_e: unknown, data: any) => callback(data);
    ipcRenderer.on(name, listener);
    return () => ipcRenderer.removeListener(name, listener);
  },
});
