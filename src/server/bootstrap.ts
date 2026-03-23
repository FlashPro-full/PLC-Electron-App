import type { Server } from "socket.io";
import { enqueueEvent } from "./state";
import { connectPlc, connectPhotoEyeSignal, startPhotoEyeMonitor, setPushersPlc } from "./plc";
import { initSession, initToken, setPushersPurescan } from "./purescan";
import { configureRuntime } from "./runtime";
import { startIntervalTimer } from "./timer";
import { reloadBeltSpeedFromDisk, getBeltSpeedValue } from "./settingsState";
import { connectKeyboardBarcode } from "./keyboard";

function nowSec(): number {
  return Date.now() / 1000;
}

export async function bootstrapBackend(io: Server): Promise<void> {
  await connectPlc();
  initSession();
  await initToken();

  connectKeyboardBarcode((barcode) => enqueueEvent("barcode", barcode, nowSec()));
  connectPhotoEyeSignal((positionId) => enqueueEvent("photo_eye", positionId, nowSec()));

  reloadBeltSpeedFromDisk();
  configureRuntime(io, getBeltSpeedValue);
  setPushersPlc();
  setPushersPurescan();

  startPhotoEyeMonitor();
  startIntervalTimer();
}
