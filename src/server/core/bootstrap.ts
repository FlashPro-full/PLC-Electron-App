import type { Server } from "socket.io";
import { enqueueEvent } from "./state";
import { setPlc, connectPhotoEye, restartPhotoEye, setPushersPlc } from "../hardware/plc";
import { setPushersPurescan } from "../integrations/purescan";
import { configureRuntime } from "./runtime";
import { startIntervalTimer } from "./timer";
import { getBeltSpeed } from "../persistence/beltSettings";
import { connectKeyboard } from "../input/keyboard";
import { connectCognex, disconnectCognex, setScannerSettings } from "../input/tcp";
import { getScannerSettings } from "../persistence/deviceSettings";
import { setBeltSpeed } from "./timer";

let lastScanBarcode = "";
let bootstrapped = false;
let scannerMode = "";

export function setScannerMode(): void {
  scannerMode = (getScannerSettings()?.mode ?? "").trim().toLowerCase().replace(/\s+/g, "");
}

function nowSec(): number {
  return Date.now() / 1000;
}

function onScanned (barcode: string): void {
  if (barcode === lastScanBarcode) {
    return;
  }

  console.log(`barcode: ${barcode}`);
  
  lastScanBarcode = barcode;
  enqueueEvent("barcode", barcode, nowSec());
};

function onPhotoEye(positionId: number | null): void {
  console.log(`positionId: ${positionId}`);
  enqueueEvent("photo_eye", positionId, nowSec());
}

export async function bootstrapBackend(io: Server): Promise<void> {
  if (bootstrapped) return;

  try {
    await setPlc();
    setScannerMode();
    setBeltSpeed(getBeltSpeed());
    setPushersPlc();
    setPushersPurescan();  

    if (scannerMode === "tcp/telnet") {
      setScannerSettings();
      await connectCognex(onScanned);
    } else {
      await connectKeyboard(onScanned);
    }

    await connectPhotoEye(onPhotoEye);

    configureRuntime(io);
    startIntervalTimer();
    bootstrapped = true;
  } catch (error) {
    bootstrapped = false;
    throw error;
  }
}

export async function restartCommunications(): Promise<void> {
  setScannerMode();
  if (scannerMode === "tcp/telnet") {
    disconnectCognex();
    setScannerSettings();
    await connectCognex(onScanned);
  } else {
    await connectKeyboard(onScanned);
  }

  await restartPhotoEye(onPhotoEye);
}
