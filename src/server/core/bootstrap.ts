import type { Server } from "socket.io";
import { enqueueEvent } from "./state";
import { connectPlc, connectPhotoEyeSignal, startPhotoEyeMonitor, setPushersPlc } from "../hardware/plc";
import { setPushersPurescan } from "../integrations/purescan";
import { configureRuntime } from "./runtime";
import { startIntervalTimer } from "./timer";
import { getBeltSpeed } from "../persistence/beltSettings";
import { connectKeyboard } from "../input/keyboard";
import { connectTcp } from "../input/tcp";
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

  const onScanned = (barcode: string) => enqueueEvent("barcode", barcode, nowSec());
  
  if (isTcpScannerMode()) {
    connectTcp(onScanned);
  } else {
    await connectKeyboard(onScanned);
  }

  connectPhotoEyeSignal((positionId: number | null) => enqueueEvent("photo_eye", positionId, nowSec()));

  configureRuntime(io);
  
  setBeltSpeed(getBeltSpeed());
  setPushersPlc();
  setPushersPurescan();

  startPhotoEyeMonitor();
  startIntervalTimer();
}
