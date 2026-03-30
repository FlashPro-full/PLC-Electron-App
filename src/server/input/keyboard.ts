import type { IGlobalKeyDownMap, IGlobalKeyEvent } from "node-global-key-listener";
import { GlobalKeyboardListener } from "node-global-key-listener";

type BarcodeCallback = (barcode: string) => void;

class BarcodeScannerListener {
  private barcode: string = "";
  private lastKeyTime: number = Date.now();
  private timeout: number = 50;
  private _callback: BarcodeCallback | null = null;
  private listener: GlobalKeyboardListener | null = null;

  setCallback(cb: BarcodeCallback | null): void {
    this._callback = cb;
  }

  private onKeyPress(event: IGlobalKeyEvent, isDown: IGlobalKeyDownMap): void {
    const currentTime = Date.now();

    if (currentTime - this.lastKeyTime > this.timeout) {
      this.barcode = "";
    }
    this.lastKeyTime = currentTime;

    if (event.state === "DOWN") {
      let char: string | null = null;
      const shift = !!(isDown["LEFT SHIFT"] || isDown["RIGHT SHIFT"]);

      if (event.name && event.name.length === 1) {
        char = shift ? event.name.toUpperCase() : event.name.toLowerCase();
      } else if (event.name === "SPACE") {
        char = " ";
      } else if (event.name === "RETURN" || event.name === "NUMPAD RETURN") {
        if (this.barcode) {
          this.processBarcode(this.barcode.trim());
        }
        this.barcode = "";
        return;
      }

      if (char !== null) {
        this.barcode += char;
      }
    }
  }

  private processBarcode(barcode: string): void {
    if (this._callback) {
      try {
        this._callback(barcode);
      } catch (error) {
        console.error("Error in barcode callback:", error);
      }
    }
  }

  start(): void {
    if (this.listener) {
      this.stop();
    }

    this.listener = new GlobalKeyboardListener();
    void this.listener.addListener((event, isDown) => {
      this.onKeyPress(event, isDown);
      return false;
    });
  }

  stop(): void {
    if (this.listener) {
      this.listener.kill();
      this.listener = null;
    }
  }
}

let _scanner: BarcodeScannerListener | null = null;
let _callback: BarcodeCallback | null = null;
let _isConnected: boolean = false;

export function connectBarcodeSignal(callback: BarcodeCallback): void {
  _callback = callback;

  if (!_scanner) {
    _scanner = new BarcodeScannerListener();
    _scanner.setCallback(callback);
    _scanner.start();
    _isConnected = true;
  } else {
    _scanner.setCallback(callback);
    if (!_isConnected) {
      _scanner.start();
      _isConnected = true;
    }
  }
}

export function disconnectBarcodeSignal(callback: BarcodeCallback): void {
  if (_callback === callback) {
    _callback = null;
    if (_scanner) {
      _scanner.setCallback(null);
    }
  }
}

export function isBarcodeScannerConnected(): boolean {
  return _isConnected && _scanner !== null;
}

export async function connectKeyboard(callback: BarcodeCallback): Promise<void> {
  connectBarcodeSignal(callback);
}

export function isKeyboardListenerActive(): boolean {
  return isBarcodeScannerConnected();
}

if (require.main === module) {
  const scanner = new BarcodeScannerListener();

  scanner.setCallback((barcode: string) => {
    console.log(`Scanned: ${barcode}`);
  });

  scanner.start();

  console.log("Barcode scanner listening... Press Ctrl+C to exit");

  process.stdin.resume();

  process.on("SIGINT", () => {
    console.log("\nShutting down...");
    scanner.stop();
    process.exit();
  });
}