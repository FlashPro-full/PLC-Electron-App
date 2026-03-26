import { createRequire } from "module";
import fs from "fs";
import path from "path";

const nodeRequire = createRequire(__filename);

let listening = false;

function globalKeyListenerBinaryPresent(): boolean {
  try {
    const pkgJson = nodeRequire.resolve("node-global-key-listener/package.json");
    const root = path.dirname(pkgJson);
    if (process.platform === "win32") {
      return fs.existsSync(path.join(root, "bin", "WinKeyServer.exe"));
    }
    if (process.platform === "darwin") {
      return fs.existsSync(path.join(root, "bin", "MacKeyServer"));
    }
    if (process.platform === "linux") {
      return fs.existsSync(path.join(root, "bin", "X11KeyServer"));
    }
    return false;
  } catch {
    return false;
  }
}

export function connectKeyboard(onBarcode: (barcode: string) => void): void {
  if (!globalKeyListenerBinaryPresent()) {
    console.warn(
      "node-global-key-listener native binary missing for this OS; KEYBOARD barcode capture disabled. Use TCP/Telnet scanner or reinstall the optional dependency."
    );
    listening = false;
    return;
  }

  try {
    const { GlobalKeyboardListener } = nodeRequire("node-global-key-listener") as {
      GlobalKeyboardListener: new () => {
        addListener: (fn: (e: { name: string }, down: boolean) => void) => Promise<void>;
      };
    };
    const listener = new GlobalKeyboardListener();
    let buffer = "";
    let lastKeyTime = 0;
    const timeoutSec = 0.05;

    void listener
      .addListener((e, down) => {
        if (!down) {
          return;
        }
        const t = Date.now() / 1000;
        if (t - lastKeyTime > timeoutSec) {
          buffer = "";
        }
        lastKeyTime = t;
        const n = e.name;
        if (n === "RETURN" || n === "ENTER" || n === "NUMPAD_ENTER") {
          if (buffer.length) {
            onBarcode(buffer.trim());
          }
          buffer = "";
          return;
        }
        if (n === "SPACE") {
          buffer += " ";
          return;
        }
        if (n.length === 1) {
          buffer += n;
        }
      })
      .then(() => {
        listening = true;
      })
      .catch(() => {
        console.warn(
          "[plc-ts] node-global-key-listener failed to start; KEYBOARD barcode capture disabled."
        );
        listening = false;
      });
  } catch {
    console.warn(
      "[plc-ts] Optional package node-global-key-listener not loaded; KEYBOARD barcode capture disabled unless USB PnP env is set."
    );
    listening = false;
  }
}

export function isKeyboardListenerActive(): boolean {
  return listening;
}
