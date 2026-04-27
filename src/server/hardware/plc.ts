import ModbusRTU from "modbus-serial";
import { getPushers } from "../persistence/beltSettings";
import { getPLCSettings } from "../persistence/deviceSettings";

let plc: ModbusRTU | null = null;
let pushers: Record<string, { label?: string; distance?: number }> = {};

const PLC_TIMEOUT_SEC = 5;
const PHOTO_EYE_FAILURE_THRESHOLD = 3;

let photoEyeCallback: ((positionId: number | null) => void) | null = null;
let photoEyeMonitorRunning = false;
let lastPhotoEyeErrorLog = 0;
let reconnectInProgress = false;

export function resetPlcConnection(): void {
  if (plc?.isOpen) {
    plc.close();
  }
  plc = null;
}

export function setPushersPlc(): void {
  pushers = getPushers();
}

export async function connectPlc(): Promise<ModbusRTU | null> {
  const { ip, port } = getPLCSettings();
  if (!ip) {
    return null;
  }
  if (reconnectInProgress) {
    return plc;
  }
  if (plc?.isOpen) {
    return plc;
  }
  reconnectInProgress = true;
  const client = new ModbusRTU();
  try {
    await client.connectTCP(ip, {
      port: port ?? 502,
      timeout: PLC_TIMEOUT_SEC * 1000
    });
    client.setID(1);
    plc = client;
    console.log("Connected to PLC");
    return client;
  } catch(err) {
    console.error("Modbus connect error:", err);
    client.close();
    plc = null;
    return null;
  } finally {
    reconnectInProgress = false;
  }
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

  if(!plc || !plc?.isOpen) plc = await connectPlc();
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

export function connectPhotoEyeSignal(cb: (positionId: number | null) => void): void {
  photoEyeCallback = cb;
}

export function startPhotoEyeMonitor(): void {
  if (photoEyeMonitorRunning) return;

  photoEyeMonitorRunning = true;
  const intervalMs = 100;

  let lastPositionId: number | null = null;
  let consecutiveReadFailures = 0;
  let reconnectDelayMs = 100;
  const maxReconnectDelayMs = 5000;

  const tick = async () => {
    if (!photoEyeMonitorRunning) return;

    try {
      if (!plc || !plc?.isOpen) {
        plc = await connectPlc();
      }

      if (!plc || !plc?.isOpen) {
        reconnectDelayMs = Math.min(reconnectDelayMs * 2, maxReconnectDelayMs);
        setTimeout(tick, reconnectDelayMs);
        return;
      }

      const positionId = await readPhotoEye();
      if (positionId === null) {
        consecutiveReadFailures += 1;
        if (consecutiveReadFailures >= PHOTO_EYE_FAILURE_THRESHOLD) {
          resetPlcConnection();
          reconnectDelayMs = Math.min(reconnectDelayMs * 2, maxReconnectDelayMs);
        }
        setTimeout(tick, Math.max(intervalMs, reconnectDelayMs));
        return;
      }
      consecutiveReadFailures = 0;

      if (lastPositionId !== null && positionId !== lastPositionId) {
        photoEyeCallback?.(positionId);
        lastPositionId = positionId;
      } else if (lastPositionId === null) {
        photoEyeCallback?.(positionId);
        lastPositionId = positionId;
      }
      reconnectDelayMs = 100;
    } catch {
      resetPlcConnection();
      const now = Date.now() / 1000;
      if (now - lastPhotoEyeErrorLog >= 30) {
        lastPhotoEyeErrorLog = now;
        console.error("Photo eye monitor loop error (PLC may be disconnected)");
      }
      reconnectDelayMs = Math.min(reconnectDelayMs * 2, maxReconnectDelayMs);
    }
    setTimeout(tick, Math.max(intervalMs, reconnectDelayMs));
  };

  setTimeout(tick, intervalMs);
}
