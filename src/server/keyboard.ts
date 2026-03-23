import { createRequire } from "module";

const nodeRequire = createRequire(__filename);

let listening = false;

export function connectKeyboardBarcode(onBarcode: (barcode: string) => void): void {
  try {
    const { GlobalKeyboardListener } = nodeRequire("node-global-key-listener") as {
      GlobalKeyboardListener: new () => {
        addListener: (fn: (e: { name: string }, down: boolean) => void) => void;
      };
    };
    const listener = new GlobalKeyboardListener();
    let buffer = "";
    let lastKeyTime = 0;
    const timeoutSec = 0.05;

    listener.addListener((e, down) => {
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
    });
    listening = true;
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
