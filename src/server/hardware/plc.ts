import ModbusRTU from "modbus-serial";
import { getPushers } from "../persistence/beltSettings";
import { getPLCSettings } from "../persistence/deviceSettings";

const PLC_TIMEOUT_SEC = 5;

let plc: ModbusRTU | null = null;
let pushers: Record<string, { label?: string; distance?: number }> = {};
let lastPositionId: number | null = null;

let photoEyeCallback: ((positionId: number | null) => void) | null = null;
let photoEyeMonitorRunning = false;
let photoEyeMonitorToken = 0;
let lastBarcodeActivityAt = 0;

const PHOTO_EYE_MISS_THRESHOLD = 3;
const BARCODE_ACTIVITY_WINDOW_MS = 5000;

export function resetPlcConnection(): void {
  plc = null;
}

export function setPushersPlc(): void {
  pushers = getPushers();
}

async function connectPlc(): Promise<ModbusRTU | null> {
  const { ip, port } = getPLCSettings();
  if (!ip || !port) {
    return null;
  }

  const client = new ModbusRTU();

  try {
    await client.connectTCP(ip, {
      port: port ?? 502,
      timeout: PLC_TIMEOUT_SEC * 1000
    });
    client.setID(1);
    console.log("Connected to PLC");
    return client;
  } catch(err) {
    console.error("Modbus connect error:", err);
    return null;
  }
}

export async function setPlcConnection(): Promise<void> {
  if (plc) return;
  plc = await connectPlc();
  if (!plc) throw new Error("Failed to connect to PLC");
}

export function isPlcConnected(): boolean {
  return Boolean(plc && plc?.isOpen);
}

export async function isPhotoEyeConnected(): Promise<boolean> {
  const result = await readPhotoEye();
  return Boolean(result !== null);
}

export async function readPhotoEye(): Promise<number | null> {
  if (!plc || !plc?.isOpen) plc = await connectPlc();
  if (!plc || !plc?.isOpen) return null;

  try {
    const result = await plc.readHoldingRegisters(0x0000, 1);
    if (result?.data && result.data.length > 0) {
      return result.data[0];
    }
    return null;
  } catch (err) {
    console.error("Modbus read error:", err);
    resetPlcConnection();
    return null;
  }
}

export async function writeBucket(pusher: number): Promise<boolean> {
  const pusherKey = `Pusher ${pusher}`;
  if (!pushers[pusherKey]) {
    console.error(`Pusher ${pusher} not found`);
    return false;
  }
  const label = pushers[pusherKey]?.label;
  if (typeof label === "string" && label.trim().toLowerCase() === "none") {
    return true;
  }

  if (!plc || !plc?.isOpen) plc = await connectPlc();
  if (!plc || !plc?.isOpen) return false;

  try {
    await plc.writeRegister(0x0001, pusher);
    return true;
  } catch (err) {
    console.error("Modbus write error:", err);
    resetPlcConnection();
    return false;
  }
}

export async function connectPhotoEyeSignal(cb: (positionId: number | null) => void): Promise<void> {
  photoEyeCallback = cb;
  lastPositionId = await readPhotoEye();
  startPhotoEyeMonitor();
}

export function markBarcodeActivity(): void {
  lastBarcodeActivityAt = Date.now();
}

export function stopPhotoEyeMonitor(): void {
  photoEyeMonitorRunning = false;
  photoEyeMonitorToken += 1;
}

export function startPhotoEyeMonitor(): void {
  if (photoEyeMonitorRunning) return;

  photoEyeMonitorRunning = true;
  const monitorToken = ++photoEyeMonitorToken;
  const intervalMs = 100;
  let consecutiveMisses = 0;

  const restartLoop = () => {
    if (!photoEyeMonitorRunning || monitorToken !== photoEyeMonitorToken) return;
    photoEyeMonitorRunning = false;
    setTimeout(() => {
      startPhotoEyeMonitor();
    }, intervalMs);
  };

  const tick = async () => {
    if (!photoEyeMonitorRunning || monitorToken !== photoEyeMonitorToken) return;

    try {
      if (!plc || !plc?.isOpen) {
        plc = await connectPlc();
      }

      if (!plc || !plc?.isOpen) {
        consecutiveMisses = 0;
        return;
      }

      const positionId = await readPhotoEye();
      
      if (positionId === null) {
        consecutiveMisses += 1;
        resetPlcConnection();
        if (
          consecutiveMisses >= PHOTO_EYE_MISS_THRESHOLD &&
          Date.now() - lastBarcodeActivityAt <= BARCODE_ACTIVITY_WINDOW_MS
        ) {
          restartLoop();
          return;
        }
        return;
      }
      consecutiveMisses = 0;

      if (lastPositionId !== null && positionId !== lastPositionId) {
        photoEyeCallback?.(positionId);
      }

      lastPositionId = positionId;
    } catch {
      resetPlcConnection();
      console.error("Photo eye monitor loop error");
    } finally {
      if (photoEyeMonitorRunning && monitorToken === photoEyeMonitorToken) {
        setTimeout(tick, intervalMs);
      }
    }
  };

  setTimeout(tick, intervalMs);
}
