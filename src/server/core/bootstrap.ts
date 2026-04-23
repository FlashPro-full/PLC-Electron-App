import type { Server } from "socket.io";
import { enqueueEvent } from "./state";
import { connectPlc, connectPhotoEyeSignal, startPhotoEyeMonitor, setPushersPlc } from "../hardware/plc";
import { setPushersPurescan } from "../integrations/purescan";
import { configureRuntime } from "./runtime";
import { startIntervalTimer } from "./timer";
import { getBeltSpeed } from "../persistence/beltSettings";
import { connectKeyboard } from "../input/keyboard";
import { connectTcp, triggerScanner } from "../input/tcp";
import { getScannerSettings } from "../persistence/deviceSettings";
import { setBeltSpeed } from "./timer";

let lastScanBarcode = "";
let lastScanAtMs = 0;
let bootstrapped = false;
let scannerMode = "";

const scanDebounceMs = 500;

export function setScannerMode(): void {
  scannerMode = (getScannerSettings()?.mode ?? "").trim().toLowerCase().replace(/\s+/g, "");
}

function nowSec(): number {
  return Date.now() / 1000;
}

function onScanned (barcode: string): void {
  const t = Date.now();
  if (barcode === lastScanBarcode && t - lastScanAtMs < scanDebounceMs) {
    return;
  }
  
  lastScanBarcode = barcode;
  lastScanAtMs = t;
  if (scannerMode === "tcp/telnet") {
    triggerScanner();
  }
  enqueueEvent("barcode", barcode, nowSec());
};

export async function bootstrapBackend(io: Server): Promise<void> {
  if (bootstrapped) return;
  bootstrapped = true;

  await connectPlc();
  setScannerMode();
  setBeltSpeed(getBeltSpeed());
  setPushersPlc();
  setPushersPurescan();  

  if (scannerMode === "tcp/telnet") {
    await connectTcp(onScanned);
  } else {
    await connectKeyboard(onScanned);
  }

  connectPhotoEyeSignal((positionId: number | null) => {
    enqueueEvent("photo_eye", positionId, nowSec());
  });

  configureRuntime(io);

  startPhotoEyeMonitor();
  startIntervalTimer();
}
