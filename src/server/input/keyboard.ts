import HID from "node-hid";

type BarcodeCallback = (barcode: string) => void;

type HIDDeviceInfo = {
  path?: string;
  vendorId?: number;
  productId?: number;
  product?: string;
  manufacturer?: string;
  interface?: number;
  usage?: number;
  usagePage?: number;
};

type BarcodeScannerOptions = {
  vendorId?: number;
  productId?: number;
  path?: string;
  timeout?: number;
  autoSelect?: boolean;
  debug?: boolean;
};

class BarcodeScannerListener {
  private barcode = "";
  private lastKeyTime = Date.now();
  private timeout: number;
  private _callback: BarcodeCallback | null = null;
  private device: HID.HID | null = null;
  private deviceInfo: HIDDeviceInfo | null = null;
  private started = false;
  private debug: boolean;

  constructor(private readonly options: BarcodeScannerOptions = {}) {
    this.timeout = options.timeout ?? 50;
    this.debug = options.debug ?? false;
  }

  setCallback(cb: BarcodeCallback | null): void {
    this._callback = cb;
  }

  static listDevices(): HID.Device[] {
    return HID.devices();
  }

  static printDevices(): void {
    const devices = HID.devices();

    if (devices.length === 0) {
      console.log("No HID devices found.");
      return;
    }

    console.log("Connected HID devices:");
    devices.forEach((d, index) => {
      console.log(
        `[${index}] product=${d.product ?? "Unknown"} manufacturer=${d.manufacturer ?? "Unknown"} ` +
          `vendorId=${d.vendorId} productId=${d.productId} path=${d.path ?? "n/a"} ` +
          `usagePage=${d.usagePage ?? "n/a"} usage=${d.usage ?? "n/a"} interface=${d.interface ?? "n/a"}`
      );
    });
  }

  private log(...args: unknown[]): void {
    if (this.debug) {
      console.log("[barcode-hid]", ...args);
    }
  }

  private resolveDevice(): HID.Device {
    const devices = HID.devices();

    if (this.options.path) {
      const device = devices.find((d) => d.path === this.options.path);
      if (!device || !device.path) {
        throw new Error(`HID device not found for path: ${this.options.path}`);
      }
      return device;
    }

    if (
      typeof this.options.vendorId === "number" &&
      typeof this.options.productId === "number"
    ) {
      const device = devices.find(
        (d) =>
          d.vendorId === this.options.vendorId &&
          d.productId === this.options.productId &&
          !!d.path
      );
      if (!device || !device.path) {
        throw new Error(
          `HID device not found for vendorId=${this.options.vendorId}, productId=${this.options.productId}`
        );
      }
      return device;
    }

    if (this.options.autoSelect !== false) {
      const keyboardLike = devices.find(
        (d) => d.path && d.usagePage === 0x01 && d.usage === 0x06
      );
      if (keyboardLike) {
        return keyboardLike;
      }
    }

    throw new Error(
      "No HID scanner selected. Pass path or vendorId/productId, or enable autoSelect with a readable keyboard-like HID interface."
    );
  }

  private decodeUsageToChar(usageId: number, shift: boolean): string | null {
    const normalMap: Record<number, string> = {
      4: "a",
      5: "b",
      6: "c",
      7: "d",
      8: "e",
      9: "f",
      10: "g",
      11: "h",
      12: "i",
      13: "j",
      14: "k",
      15: "l",
      16: "m",
      17: "n",
      18: "o",
      19: "p",
      20: "q",
      21: "r",
      22: "s",
      23: "t",
      24: "u",
      25: "v",
      26: "w",
      27: "x",
      28: "y",
      29: "z",

      30: "1",
      31: "2",
      32: "3",
      33: "4",
      34: "5",
      35: "6",
      36: "7",
      37: "8",
      38: "9",
      39: "0",

      44: " ",
      45: "-",
      46: "=",
      47: "[",
      48: "]",
      49: "\\",
      51: ";",
      52: "'",
      53: "`",
      54: ",",
      55: ".",
      56: "/",
    };

    const shiftMap: Record<number, string> = {
      30: "!",
      31: "@",
      32: "#",
      33: "$",
      34: "%",
      35: "^",
      36: "&",
      37: "*",
      38: "(",
      39: ")",

      45: "_",
      46: "+",
      47: "{",
      48: "}",
      49: "|",
      51: ":",
      52: "\"",
      53: "~",
      54: "<",
      55: ">",
      56: "?",
    };

    if (usageId >= 4 && usageId <= 29) {
      const base = normalMap[usageId];
      return shift ? base.toUpperCase() : base;
    }

    if (shift && shiftMap[usageId]) {
      return shiftMap[usageId];
    }

    return normalMap[usageId] ?? null;
  }

  private processBarcode(barcode: string): void {
    if (!barcode) {
      return;
    }

    if (this._callback) {
      try {
        this._callback(barcode);
      } catch (error) {
        console.error("Error in barcode callback:", error);
      }
    }
  }

  private handleReport(data: Buffer): void {
    const currentTime = Date.now();

    if (currentTime - this.lastKeyTime > this.timeout) {
      this.barcode = "";
    }
    this.lastKeyTime = currentTime;

    if (data.length < 3) {
      this.log("Ignoring short HID report:", data);
      return;
    }

    const modifier = data[0];
    const shift = (modifier & 0x22) !== 0;

    const usages = Array.from(data.slice(2, 8)).filter((code) => code !== 0);
    if (usages.length === 0) {
      return;
    }

    for (const usageId of usages) {
      if (usageId === 40) {
        if (this.barcode) {
          this.processBarcode(this.barcode.trim());
        }
        this.barcode = "";
        continue;
      }

      const char = this.decodeUsageToChar(usageId, shift);
      if (char !== null) {
        this.barcode += char;
      } else {
        this.log("Unhandled HID usage:", usageId, "report:", data);
      }
    }
  }

  start(): void {
    if (this.started) {
      this.stop();
    }

    const selected = this.resolveDevice();

    if (!selected.path) {
      throw new Error("Selected HID device does not have an openable path.");
    }

    this.deviceInfo = {
      path: selected.path,
      vendorId: selected.vendorId,
      productId: selected.productId,
      product: selected.product,
      manufacturer: selected.manufacturer,
      interface: selected.interface,
      usage: selected.usage,
      usagePage: selected.usagePage,
    };

    this.device = new HID.HID(selected.path);
    this.started = true;

    this.log("Connected to HID device:", this.deviceInfo);

    this.device.on("data", (data: Buffer) => {
      this.handleReport(data);
    });

    this.device.on("error", (err: Error) => {
      console.error("HID device error:", err);
      this.stop();
    });
  }

  stop(): void {
    if (this.device) {
      try {
        this.device.removeAllListeners("data");
        this.device.removeAllListeners("error");
        this.device.close();
      } catch (error) {
        this.log("Error while closing HID device:", error);
      }
      this.device = null;
    }

    this.started = false;
  }

  isActive(): boolean {
    return this.started && this.device !== null;
  }

  getDeviceInfo(): HIDDeviceInfo | null {
    return this.deviceInfo;
  }
}

let _scanner: BarcodeScannerListener | null = null;
let _callback: BarcodeCallback | null = null;
let _isConnected = false;

export function connectBarcodeSignal(
  callback: BarcodeCallback,
  options: BarcodeScannerOptions = {}
): void {
  _callback = callback;

  if (!_scanner) {
    _scanner = new BarcodeScannerListener(options);
    _scanner.setCallback(callback);
    _scanner.start();
    _isConnected = true;
    return;
  }

  _scanner.setCallback(callback);

  if (!_isConnected) {
    _scanner.start();
    _isConnected = true;
  }
}

export function disconnectBarcodeSignal(callback: BarcodeCallback): void {
  if (_callback === callback) {
    _callback = null;

    if (_scanner) {
      _scanner.setCallback(null);
      _scanner.stop();
    }

    _isConnected = false;
  }
}

export function isBarcodeScannerConnected(): boolean {
  return _isConnected && _scanner !== null && _scanner.isActive();
}

export async function connectKeyboard(
  callback: BarcodeCallback,
  options: BarcodeScannerOptions = {}
): Promise<void> {
  connectBarcodeSignal(callback, options);
}

export function isKeyboardListenerActive(): boolean {
  return isBarcodeScannerConnected();
}

export function listHIDDevices(): HID.Device[] {
  return BarcodeScannerListener.listDevices();
}

if (require.main === module) {
  try {
    BarcodeScannerListener.printDevices();

    const scanner = new BarcodeScannerListener({
      autoSelect: true,
      timeout: 50,
      debug: true,
    });

    scanner.setCallback((barcode: string) => {
      console.log(`Scanned: ${barcode}`);
    });

    scanner.start();

    console.log("Barcode scanner listening via node-hid... Press Ctrl+C to exit");
    const info = scanner.getDeviceInfo();
    if (info) {
      console.log("Using device:", info);
    }

    process.stdin.resume();

    process.on("SIGINT", () => {
      console.log("\nShutting down...");
      scanner.stop();
      process.exit(0);
    });
  } catch (error) {
    console.error("Failed to start barcode scanner:", error);
    process.exit(1);
  }
}