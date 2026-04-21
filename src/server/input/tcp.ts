import net from "net";
import { getScannerSettings } from "../persistence/deviceSettings";

const RECONNECT_MS = 3000;
const MAX_BUFFER = 65536;

const COGNEX_TRIGGER_CMD = "||>TRIGGER ON\r\n";

const MAX_OWED_TRIGGERS = 2;

const CONTINUOUS_READ_MS = 100;

const REMAINDER_BARCODE_MIN_LEN = 4;
const REMAINDER_BARCODE_MAX_LEN = 256;

let socket: net.Socket | null = null;
let connected = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let slot: ((barcode: string) => void) | null = null;
let lineBuffer = "";
let scannerHost: string | null = null;
let scannerPort: number | null = null;

let owedTriggers = 0;
let triggerAwaitingDrain = false;
let lastTriggerWriteErrorLogSec = 0;

let continuousReadRunning = false;

function resetTriggerBackpressureState(): void {
  owedTriggers = 0;
  triggerAwaitingDrain = false;
}

function stopContinuousReadLoop(): void {
  continuousReadRunning = false;
}

function startContinuousReadLoop(): void {
  if (continuousReadRunning) {
    return;
  }
  continuousReadRunning = true;
  const intervalMs = CONTINUOUS_READ_MS;

  const tick = (): void => {
    if (!continuousReadRunning) {
      return;
    }
    if (connected && socket && !socket.destroyed) {
      if (!triggerAwaitingDrain) {
        owedTriggers = Math.min(MAX_OWED_TRIGGERS, owedTriggers + 1);
        tryFlushTriggerWrites();
      }
    }
    setTimeout(tick, intervalMs);
  };

  if (connected && socket && !socket.destroyed) {
    owedTriggers = Math.min(MAX_OWED_TRIGGERS, owedTriggers + 1);
    tryFlushTriggerWrites();
  }
  setTimeout(tick, intervalMs);
}

export function setScannerSettings(): void {
  const s = getScannerSettings();
  scannerHost = s.ip?.trim() ?? null;
  scannerPort = s.port ?? null;
}

function clearReconnectTimer(): void {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function writeTriggerIfConnected(): void {
  if (!connected || !socket || socket.destroyed) {
    return;
  }
  owedTriggers = Math.min(MAX_OWED_TRIGGERS, owedTriggers + 1);
  tryFlushTriggerWrites();
}

function tryFlushTriggerWrites(): void {
  if (!connected || !socket || socket.destroyed) {
    owedTriggers = 0;
    triggerAwaitingDrain = false;
    return;
  }

  try {
    while (owedTriggers > 0) {
      const ok = socket.write(COGNEX_TRIGGER_CMD);
      if (ok === false) {
        if (!triggerAwaitingDrain) {
          triggerAwaitingDrain = true;
          socket.once("drain", () => {
            triggerAwaitingDrain = false;
            tryFlushTriggerWrites();
          });
        }
        return;
      }
      owedTriggers -= 1;
    }
  } catch (e) {
    const now = Date.now() / 1000;
    if (now - lastTriggerWriteErrorLogSec >= 5) {
      lastTriggerWriteErrorLogSec = now;
      console.error("[tcp] TRIGGER write failed:", e);
    }
    owedTriggers = 0;
    triggerAwaitingDrain = false;
  }
}

export function triggerScanner(): void {
  writeTriggerIfConnected();
}

function looksLikeCompleteBarcodeRemainder(s: string): boolean {
  const t = s.replace(/\0/g, "").trim();
  if (t.length < REMAINDER_BARCODE_MIN_LEN || t.length > REMAINDER_BARCODE_MAX_LEN) {
    return false;
  }
  if (t.startsWith("||")) {
    return false;
  }
  if (/[\r\n]/.test(t)) {
    return false;
  }
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    if (c < 32 || c > 126) {
      return false;
    }
  }
  return true;
}

function emitLine(raw: string): void {
  if (!slot) return;
  const barcode = raw.replace(/\0/g, "").replace(/\r$/, "").trim();
  if (barcode.length === 0) {
    return;
  }
  if (barcode.startsWith("||")) {
    return;
  }
  slot(barcode);
}

function consumeBuffer(): void {
  let i: number;
  while ((i = lineBuffer.indexOf("\n")) >= 0) {
    const line = lineBuffer.slice(0, i);
    lineBuffer = lineBuffer.slice(i + 1);
    emitLine(line);
  }

  while ((i = lineBuffer.indexOf("\r")) >= 0) {
    const line = lineBuffer.slice(0, i);
    lineBuffer = lineBuffer.slice(i + 1);
    if (line.length > 0) {
      emitLine(line);
    }
  }

  if (lineBuffer.length > MAX_BUFFER) {
    console.warn("[tcp] Buffer overflow, clearing");
    lineBuffer = "";
  }
}

function attachSocket(sock: net.Socket): void {
  sock.setEncoding("utf8");

  sock.setKeepAlive(true, 10000);

  sock.on("data", (chunk: string) => {
    lineBuffer += chunk;
    consumeBuffer();
  });

  sock.on("error", (err) => {
    console.error("[tcp] Socket error:", err);
    connected = false;
    stopContinuousReadLoop();
    resetTriggerBackpressureState();
  });

  sock.on("close", () => {
    console.log("[tcp] Connection closed");
    stopContinuousReadLoop();
    connected = false;
    resetTriggerBackpressureState();

    if (lineBuffer.length > 0) {
      const remainder = lineBuffer.replace(/\0/g, "").trim();
      lineBuffer = "";
      if (remainder.length > 0) {
        if (looksLikeCompleteBarcodeRemainder(remainder)) {
          emitLine(remainder);
        } else if (!remainder.startsWith("||")) {
          console.warn(`[tcp] Discarding incomplete TCP remainder on close (${remainder.slice(0, 120)})`);
        }
      }
    }

    if (slot) {
      clearReconnectTimer();
      reconnectTimer = setTimeout(connectToScanner, RECONNECT_MS);
    }
  });

  startContinuousReadLoop();
}

async function connectScanner(
  sock: net.Socket,
  port: number,
  host: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    sock.setTimeout(5000);

    sock.once("connect", () => {
      console.log(`[tcp] Successfully connected to ${host}:${port}`);
      connected = true;
      sock.setTimeout(0);
      resolve();
    });

    sock.once("timeout", () => {
      console.error("[tcp] Connection timeout");
      sock.destroy();
      reject(new Error("Connection timeout"));
    });

    sock.once("error", (err) => {
      console.error("[tcp] Connection error:", err);
      reject(err);
    });

    sock.connect(port, host);
  });
}

async function connectToScanner(): Promise<void> {
  try {
    clearReconnectTimer();
    stopContinuousReadLoop();

    if (!slot) return;

    const host = scannerHost;
    const port = scannerPort;

    if (!host || port == null || port < 1 || port > 65535) {
      connected = false;
      reconnectTimer = setTimeout(connectToScanner, RECONNECT_MS);
      return;
    }

    if (socket && !socket.destroyed) {
      socket.removeAllListeners();
      socket.destroy();
    }

    lineBuffer = "";
    resetTriggerBackpressureState();
    const sock = new net.Socket();
    socket = sock;

    await connectScanner(sock, port, host);
    attachSocket(sock);
  } catch (err) {
    console.error("[tcp] Failed to connect to scanner:", err);
    connected = false;
    reconnectTimer = setTimeout(connectToScanner, RECONNECT_MS);
  }
}

export async function connectTcp(onBarcode: (barcode: string) => void): Promise<void> {
  console.log("[tcp] Initializing TCP connection to Cognex scanner...");
  slot = onBarcode;
  await connectToScanner();
}

export function disconnectTcp(): void {
  console.log("[tcp] Disconnecting...");
  clearReconnectTimer();
  stopContinuousReadLoop();
  resetTriggerBackpressureState();

  if (socket && !socket.destroyed) {
    socket.removeAllListeners();
    socket.destroy();
  }

  socket = null;
  connected = false;
  slot = null;
  lineBuffer = "";
}

export function isTcpScannerActive(): boolean {
  return connected;
}
