import type { Server } from "socket.io";
import { enqueueEvent } from "./state";
import { connectPlc, connectPhotoEyeSignal, startPhotoEyeMonitor, setPushersPlc } from "../hardware/plc";
import { setPushersPurescan } from "../integrations/purescan";
import { configureRuntime } from "./runtime";
import { startIntervalTimer } from "./timer";
import { getBeltSettings } from "../persistence/beltSettings";
import { connectKeyboard } from "../input/keyboard";
import { connectTcp, triggerCognexAcquireOnce } from "../input/tcp";
import { getScannerSettings } from "../persistence/deviceSettings";
import { setBeltSpeed } from "./timer";

let delayTime = 0;
let lastScanBarcode = "";
let lastScanAtMs = 0;
let bootstrapped = false;
let scannerMode = "";

const scanDebounceMs = 500;

export function setDelayTime(): void {
  const s = getBeltSettings();
  setBeltSpeed(s.belt_speed);
  const temp = s.belt_speed > 0 ? s.distance / s.belt_speed : 0;
  delayTime = Number.isFinite(temp) ? Math.max(0, temp) * 1000 : 0;
}

export function setScannerMode(): void {
  scannerMode = (getScannerSettings()?.mode ?? "").trim().toLowerCase().replace(/\s+/g, "");
}

function nowSec(): number {
  return Date.now() / 1000;
}

function onPhotoEye(positionId: number | null): void {
  if (scannerMode === "tcp/telnet" && positionId != null) {
    setTimeout(triggerCognexAcquireOnce, delayTime);
  }
  enqueueEvent("photo_eye", positionId, nowSec());
}

function onScanned(barcode: string): void {
  const t = Date.now();
  if (barcode === lastScanBarcode && t - lastScanAtMs < scanDebounceMs) {
    return;
  }

  lastScanBarcode = barcode;
  lastScanAtMs = t;
  enqueueEvent("barcode", barcode, nowSec());
};

export async function bootstrapBackend(io: Server): Promise<void> {
  if (bootstrapped) return;
  bootstrapped = true;

  await connectPlc();

  setDelayTime();
  setScannerMode();
  setPushersPlc();
  setPushersPurescan();

  if (scannerMode === "tcp/telnet") {
    await connectTcp(onScanned);
  } else {
    await connectKeyboard(onScanned);
  }

  connectPhotoEyeSignal(onPhotoEye);

  configureRuntime(io);

  startPhotoEyeMonitor();
  startIntervalTimer();
}
