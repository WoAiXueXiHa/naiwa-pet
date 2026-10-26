import {
  ipcMain,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type BrowserWindow,
} from "electron";
import { trustedSender } from "./ipc-policy";
export function registerIpc(windows: () => (BrowserWindow | null)[]) {
  const trusted = (e: IpcMainEvent | IpcMainInvokeEvent) =>
    trustedSender(
      e.sender,
      e.senderFrame,
      e.sender.mainFrame,
      windows()
        .filter((w) => w && !w.isDestroyed())
        .map((w) => w!.webContents),
    );
  const cleanup: (() => void)[] = [];
  return {
    handle(name: string, fn: (e: IpcMainInvokeEvent, data: any) => any) {
      ipcMain.handle(name, (e, data) => {
        if (!trusted(e)) throw new Error("IPC source rejected");
        return fn(e, data);
      });
      cleanup.push(() => ipcMain.removeHandler(name));
    },
    on(name: string, fn: (e: IpcMainEvent, data: any) => void) {
      const listener = (e: IpcMainEvent, data: any) => {
        if (trusted(e)) fn(e, data);
      };
      ipcMain.on(name, listener);
      cleanup.push(() => ipcMain.removeListener(name, listener));
    },
    dispose() {
      cleanup.splice(0).forEach((fn) => fn());
    },
  };
}
