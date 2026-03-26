import { app, BrowserWindow, dialog, Menu } from "electron";
import * as path from "path";
import * as net from "net";

const PORT = 5049;
const WAIT_HOST = "127.0.0.1";

let mainWin: BrowserWindow | null = null;

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
    return path.dirname(process.execPath);
  }
  return path.resolve(__dirname, "..", "..", "..");
}

async function startBackendInProcess(): Promise<void> {
  process.env.PLC_APP_ROOT = plcAppRoot();

  if (process.env.PLC_ELECTRON_EXTERNAL_SERVER === "1") {
    await waitForPort(WAIT_HOST, PORT, 60_000);
    return;
  }

  const serverPath = path.join(__dirname, "..", "server", "main.js");
  const serverMain = require(serverPath) as { runServer: () => Promise<void> };
  await serverMain.runServer();
  await waitForPort(WAIT_HOST, PORT, 60_000);
}

function appUrl(pathWithQuery: string): string {
  return `http://${WAIT_HOST}:${PORT}${pathWithQuery}`;
}

function createMainWindow(): void {
  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.focus();
    return;
  }
  mainWin = new BrowserWindow({
    width: 1400,
    height: 1000,
    show: false,
    icon: path.join(__dirname, "icon.png"),
    autoHideMenuBar: process.platform !== "darwin",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (process.platform !== "darwin") {
    mainWin.setMenuBarVisibility(false);
  }
  mainWin.once("ready-to-show", () => mainWin?.show());
  void mainWin.loadURL(appUrl("/"));
  mainWin.on("closed", () => {
    mainWin = null;
    app.quit();
  });
}

app.whenReady().then(() => {
  if (process.platform !== "darwin") {
    Menu.setApplicationMenu(null);
  }

  void startBackendInProcess()
    .then(() => {
      createMainWindow();
    })
    .catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      void dialog.showErrorBox("PLC Conveyor", `Could not start the app server:\n\n${msg}`);
      app.quit();
    });
});
