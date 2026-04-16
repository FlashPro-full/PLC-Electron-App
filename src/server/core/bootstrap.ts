import type { Server } from "socket.io";
import { enqueueEvent } from "./state";
import { connectPlc, connectPhotoEyeSignal, startPhotoEyeMonitor, setPushersPlc } from "../hardware/plc";
import { setPushersPurescan } from "../integrations/purescan";
import { configureRuntime } from "./runtime";
import { startIntervalTimer } from "./timer";
import { getBeltSettings, getBeltSpeed, getDistance } from "../persistence/beltSettings";
import { connectKeyboard } from "../input/keyboard";
import { connectTcp, triggerCognexAcquireOnce } from "../input/tcp";
import { getScannerSettings } from "../persistence/deviceSettings";
import { setBeltSpeed } from "./timer";

function nowSec(): number {
  return Date.now() / 1000;
}

function isTcpScannerMode(): boolean {
  const s = (getScannerSettings()?.mode ?? "").trim().toLowerCase().replace(/\s+/g, "");
  return s === "tcp/telnet" || s === "tcptelnet" || s === "optimal";
}

let bootstrapped = false;

export async function bootstrapBackend(io: Server): Promise<void> {
  if (bootstrapped) return;
  bootstrapped = true;

  await connectPlc();

  let lastScanBarcode = "";
  let lastScanAtMs = 0;
  const scanDebounceMs = 500;
  const onScanned = (barcode: string) => {
    const t = Date.now();
    if (barcode === lastScanBarcode && t - lastScanAtMs < scanDebounceMs) {
      return;
    }

    lastScanBarcode = barcode;
    lastScanAtMs = t;
    enqueueEvent("barcode", barcode, nowSec());
  };

  if (isTcpScannerMode()) {
    await connectTcp(onScanned);
  } else {
    await connectKeyboard(onScanned);
  }

  connectPhotoEyeSignal((positionId: number | null) => {
    if (isTcpScannerMode() && positionId != null) {
      const distance = getDistance();
      const beltSpeed = getBeltSpeed();
      const delayTime = distance / beltSpeed;
      setTimeout(() => {
        triggerCognexAcquireOnce();
      }, delayTime * 1000);
    }
    enqueueEvent("photo_eye", positionId, nowSec());
  });

  configureRuntime(io);
  
  setBeltSpeed(getBeltSpeed());
  setPushersPlc();
  setPushersPurescan();

  startPhotoEyeMonitor();
  startIntervalTimer();
}
