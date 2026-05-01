import ModbusRTU from "modbus-serial";
import { getPushers } from "../persistence/beltSettings";
import { getPLCSettings } from "../persistence/deviceSettings";

const PLC_TIMEOUT_SEC = 5;
const PLC_HEALTH_LOG_MS = 30_000;
const PLC_SLOW_READ_WARN_MS = 1_000;
const PLC_READ_TIMEOUT_MS = 1_500;

let plc: ModbusRTU | null = null;
let pushers: Record<string, { label?: string; distance?: number }> = {};
let lastPositionId: number | null = null;

let photoEyeCallback: ((positionId: number | null) => void) | null = null;
let photoEyeMonitorRunning = false;
let lastHealthLogMs = 0;
let photoEyeReadInFlight: Promise<number | null> | null = null;

const plcDiag = {
  connectAttempts: 0,
  connectSuccess: 0,
  connectFailures: 0,
  reconnects: 0,
  monitorStarts: 0,
  monitorLoopErrors: 0,
  monitorNullReads: 0,
  readAttempts: 0,
  readSuccess: 0,
  readErrors: 0,
  readTimeouts: 0,
  consecutiveReadFailures: 0,
  slowReads: 0,
  maxReadMs: 0,
  inFlightReadStartedAtMs: 0,
  lastConnectOkAtMs: 0,
  lastConnectErrorAtMs: 0,
  lastReadOkAtMs: 0,
  lastReadErrorAtMs: 0,
  lastTickAtMs: 0,
  lastPositionChangeAtMs: 0,
  lastEmitAtMs: 0,
};

function formatAgo(ms: number): string {
  if (!ms) return "never";
  const sec = Math.floor((Date.now() - ms) / 1000);
  return `${sec}s ago`;
}

function logPlcHealth(reason: string): void {
  const now = Date.now();
  if (now - lastHealthLogMs < PLC_HEALTH_LOG_MS && reason === "heartbeat") {
    return;
  }
  lastHealthLogMs = now;

  const socketOpen = Boolean(plc && plc.isOpen);
  const inFlightSec =
    plcDiag.inFlightReadStartedAtMs > 0
      ? Math.floor((now - plcDiag.inFlightReadStartedAtMs) / 1000)
      : 0;

  console.log(
    `[plc][diag] ${reason} open=${socketOpen} monitor=${photoEyeMonitorRunning} reads=${plcDiag.readSuccess}/${plcDiag.readAttempts} readErr=${plcDiag.readErrors} readTimeout=${plcDiag.readTimeouts} consecutiveFail=${plcDiag.consecutiveReadFailures} slowReads=${plcDiag.slowReads} maxReadMs=${plcDiag.maxReadMs} inFlightSec=${inFlightSec} reconnects=${plcDiag.reconnects} connect=${plcDiag.connectSuccess}/${plcDiag.connectAttempts} connectFail=${plcDiag.connectFailures} lastReadOk=${formatAgo(plcDiag.lastReadOkAtMs)} lastReadErr=${formatAgo(plcDiag.lastReadErrorAtMs)} lastConnectOk=${formatAgo(plcDiag.lastConnectOkAtMs)} lastTick=${formatAgo(plcDiag.lastTickAtMs)}`
  );
}

class PlcReadTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`PLC read timed out after ${timeoutMs}ms`);
    this.name = "PlcReadTimeoutError";
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new PlcReadTimeoutError(timeoutMs)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function closePlcClient(client: ModbusRTU | null): void {
  if (!client) return;
  try {
    const closeFn = (client as unknown as { close?: () => void }).close;
    closeFn?.call(client);
  } catch {}
}

function resetPlc(): void {
  closePlcClient(plc);
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
  const startedAt = Date.now();
  plcDiag.connectAttempts += 1;

  try {
    await client.connectTCP(ip, {
      port: port ?? 502,
      timeout: PLC_TIMEOUT_SEC * 1000
    });
    client.setID(1);
    plcDiag.connectSuccess += 1;
    plcDiag.lastConnectOkAtMs = Date.now();
    console.log(`[plc] Connected to PLC in ${Date.now() - startedAt}ms`);
    return client;
  } catch(err) {
    plcDiag.connectFailures += 1;
    plcDiag.lastConnectErrorAtMs = Date.now();
    console.error(`[plc] Modbus connect error after ${Date.now() - startedAt}ms:`, err);
    logPlcHealth("connect_error");
    return null;
  }
}

export async function setPlc(): Promise<void> {
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
  if (photoEyeReadInFlight) {
    return photoEyeReadInFlight;
  }

  photoEyeReadInFlight = readPhotoEyeInternal();
  try {
    return await photoEyeReadInFlight;
  } finally {
    photoEyeReadInFlight = null;
  }
}

async function readPhotoEyeInternal(): Promise<number | null> {
  if (!plc || !plc?.isOpen) plc = await connectPlc();
  if (!plc || !plc?.isOpen) return null;

  const startedAt = Date.now();
  plcDiag.inFlightReadStartedAtMs = startedAt;
  plcDiag.readAttempts += 1;

  try {
    const result = await withTimeout(plc.readHoldingRegisters(0x0000, 1), PLC_READ_TIMEOUT_MS);
    const elapsedMs = Date.now() - startedAt;
    plcDiag.maxReadMs = Math.max(plcDiag.maxReadMs, elapsedMs);
    if (elapsedMs >= PLC_SLOW_READ_WARN_MS) {
      plcDiag.slowReads += 1;
      console.warn(`[plc][diag] Slow read: ${elapsedMs}ms`);
    }
    if (result?.data && result.data.length > 0) {
      plcDiag.readSuccess += 1;
      plcDiag.consecutiveReadFailures = 0;
      plcDiag.lastReadOkAtMs = Date.now();
      return result.data[0];
    }
    return null;
  } catch (err) {
    plcDiag.readErrors += 1;
    plcDiag.consecutiveReadFailures += 1;
    plcDiag.lastReadErrorAtMs = Date.now();
    if (err instanceof PlcReadTimeoutError) {
      plcDiag.readTimeouts += 1;
      console.error("[plc] Modbus read timeout:", err.message);
      logPlcHealth("read_timeout");
    } else {
      console.error("[plc] Modbus read error:", err);
      logPlcHealth("read_error");
    }
    resetPlc();
    return null;
  } finally {
    plcDiag.inFlightReadStartedAtMs = 0;
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
    resetPlc();
    return false;
  }
}

export async function connectPhotoEye(cb: (positionId: number | null) => void): Promise<void> {
  photoEyeCallback = cb;
  lastPositionId = await readPhotoEye();
  startPhotoEyeMonitor();
}

export async function restartPhotoEye(cb: (positionId: number | null) => void): Promise<void> {
  photoEyeCallback = cb;
  photoEyeMonitorRunning = false;
  lastPositionId = null;
  resetPlc();
  lastPositionId = await readPhotoEye();
  startPhotoEyeMonitor();
}

export function startPhotoEyeMonitor(): void {
  if (photoEyeMonitorRunning) return;

  plcDiag.monitorStarts += 1;
  photoEyeMonitorRunning = true;
  const intervalMs = 400;

  const tick = async () => {
    plcDiag.lastTickAtMs = Date.now();
    if (!photoEyeMonitorRunning) return;

    try {
      if (!plc || !plc?.isOpen) {
        plcDiag.reconnects += 1;
        plc = await connectPlc();
      }

      if (!plc || !plc?.isOpen) {
        logPlcHealth("not_open");
        return;
      }

      const positionId = await readPhotoEye();
      
      if (positionId === null) {
        plcDiag.monitorNullReads += 1;
        console.warn("[plc][diag] Photo eye read returned null; forcing reconnect");
        resetPlc();
        photoEyeMonitorRunning = false;
        logPlcHealth("null_position");
        return startPhotoEyeMonitor();
      }

      if (lastPositionId !== null && positionId !== lastPositionId) {
        plcDiag.lastPositionChangeAtMs = Date.now();
        plcDiag.lastEmitAtMs = Date.now();
        photoEyeCallback?.(positionId);
      }

      lastPositionId = positionId;
    } catch {
      plcDiag.monitorLoopErrors += 1;
      resetPlc();
      console.error("[plc] Photo eye monitor loop error");
      logPlcHealth("monitor_error");
    } finally {
      logPlcHealth("heartbeat");
      setTimeout(tick, intervalMs);
    }
  };

  setTimeout(tick, intervalMs);
}
