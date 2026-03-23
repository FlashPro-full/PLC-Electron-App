import ModbusRTU from "modbus-serial";
import fs from "fs";
import path from "path";

let client: ModbusRTU | null = null;
let pushers: Record<string, { label?: string; distance?: number }> = {};

const PLC_IP = process.env.PLC_IP;
const PLC_PORT = parseInt(process.env.PLC_PORT || "502", 10);
const PLC_TIMEOUT_SEC = parseFloat(process.env.PLC_TIMEOUT || "5");
const UNIT_ID = parseInt(process.env.MODBUS_UNIT_ID || "1", 10);

let photoEyeCallback: ((positionId: number | null) => void) | null = null;
let photoEyeMonitorRunning = false;
let lastPositionId: number | null = 0;
let lastPhotoEyeErrorLog = 0;

export function setPushersPlc(): void {
  const settingsPath = path.join(process.cwd(), "settings.json");
  const raw = fs.readFileSync(settingsPath, "utf8");
  const settings = JSON.parse(raw) as { pushers: Record<string, { label?: string; distance?: number }> };
  pushers = settings.pushers || {};
}

export async function connectPlc(): Promise<ModbusRTU | null> {
  if (!PLC_IP) {
    return null;
  }
  if (client?.isOpen) {
    return client;
  }
  const c = new ModbusRTU();
  try {
    await c.connectTCP(PLC_IP, {
      port: PLC_PORT,
      timeout: Math.max(1000, Math.round(PLC_TIMEOUT_SEC * 1000)),
    });
    c.setID(UNIT_ID);
    client = c;
    return c;
  } catch {
    try {
      c.close(() => undefined);
    } catch {
      /* ignore */
    }
    client = null;
    return null;
  }
}

export function isPlcConnected(): boolean {
  return Boolean(client?.isOpen);
}

export async function readPhotoEye(): Promise<number | null> {
  const c = client ?? (await connectPlc());
  if (!c?.isOpen) {
    return null;
  }
  try {
    const result = await c.readHoldingRegisters(0x0000, 1);
    if (result?.data && result.data.length > 0) {
      return result.data[0] ?? null;
    }
    return null;
  } catch {
    return 0;
  }
}

export async function writeBucket(pusher: number): Promise<number> {
  const pusherKey = `Pusher ${pusher}`;
  if (!pushers[pusherKey]) {
    console.error(`Pusher ${pusher} not found in settings.json`);
    return 0;
  }
  const label = pushers[pusherKey]?.label;
  if (typeof label === "string" && label.trim().toLowerCase() === "none") {
    return 1;
  }

  const c = client ?? (await connectPlc());
  if (!c?.isOpen) {
    return 0;
  }
  try {
    await c.writeRegister(0x0001, pusher);
    return 1;
  } catch (e) {
    console.error("Modbus write error:", e);
    return 0;
  }
}

export function connectPhotoEyeSignal(cb: (positionId: number | null) => void): void {
  photoEyeCallback = cb;
}

export function startPhotoEyeMonitor(): void {
  if (photoEyeMonitorRunning) {
    return;
  }
  photoEyeMonitorRunning = true;
  const intervalMs = 50;

  const tick = async () => {
    if (!photoEyeMonitorRunning) {
      return;
    }
    try {
      if (!client?.isOpen) {
        await connectPlc();
      }
      const positionId = await readPhotoEye();
      const last = lastPositionId;
      const pyStyleLastNotZero = last == null || last !== 0;
      if (pyStyleLastNotZero && positionId !== last) {
        const cb = photoEyeCallback;
        if (cb) {
          try {
            cb(positionId);
          } catch {
            /* ignore */
          }
        }
      }
      lastPositionId = positionId;
    } catch {
      const now = Date.now() / 1000;
      if (now - lastPhotoEyeErrorLog >= 30) {
        lastPhotoEyeErrorLog = now;
        console.error("Photo eye monitor loop error (PLC may be disconnected)");
      }
    }
    setTimeout(tick, intervalMs);
  };

  setTimeout(tick, intervalMs);
}
