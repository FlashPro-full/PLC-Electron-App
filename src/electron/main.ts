import { app, BrowserWindow, dialog, Menu } from "electron";
import * as path from "path";
import * as net from "net";

const PORT = parseInt(process.env.PLC_PORT || process.env.FLASK_PORT || "5000", 10);
const WAIT_HOST = "127.0.0.1";

function waitForPort(host: string, port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const socket = new net.Socket();
      socket.setTimeout(400);
      socket.once("connect", () => {
        socket.destroy();
        resolve();
      });
      socket.once("timeout", () => {
        socket.destroy();
        scheduleRetry();
      });
      socket.once("error", () => {
        scheduleRetry();
      });
      socket.connect(port, host);
    };
    const scheduleRetry = () => {
      if (Date.now() >= deadline) {
        reject(new Error(`Timed out waiting for ${host}:${port}`));
        return;
      }
      setTimeout(tryOnce, 200);
    };
    tryOnce();
  });
}

function plcAppRoot(): string {
  if (app.isPackaged) {
    const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
    if (portableDir) {
      return portableDir;
    }
    return path.dirname(process.execPath);
  }
  return path.resolve(__dirname, "..", "..", "..");
}

async function startBackendInProcess(): Promise<void> {
  process.env.PLC_APP_ROOT = plcAppRoot();
  if (!process.env.FLASK_HOST) {
    process.env.FLASK_HOST = "127.0.0.1";
  }

  if (process.env.PLC_ELECTRON_EXTERNAL_SERVER === "1") {
    await waitForPort(WAIT_HOST, PORT, 60_000);
    return;
  }

  const serverPath = path.join(__dirname, "..", "server", "main.js");
  const serverMain = require(serverPath) as { runServer: () => Promise<void> };
  await serverMain.runServer();
  await waitForPort(WAIT_HOST, PORT, 60_000);
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    autoHideMenuBar: process.platform !== "darwin",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  if (process.platform !== "darwin") {
    win.setMenuBarVisibility(false);
  }
  win.once("ready-to-show", () => win.show());
  void win.loadURL(`http://${WAIT_HOST}:${PORT}`);
}

app.whenReady().then(() => {
  if (process.platform !== "darwin") {
    Menu.setApplicationMenu(null);
  }

  void startBackendInProcess()
    .then(() => {
      createWindow();
    })
    .catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      void dialog.showErrorBox("PLC Conveyor", `Could not start the app server:\n\n${msg}`);
      app.quit();
    });
});

app.on("window-all-closed", () => {
  app.quit();
});
