import net from "net";
import { getScannerSettings } from "../persistence/deviceSettings";

const RECONNECT_MS = 3000;
const MAX_BUFFER = 65536;

let socket: net.Socket | null = null;
let connected = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let slot: ((barcode: string) => void) | null = null;
let lineBuffer = "";

function clearReconnectTimer(): void {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function isLikelyDmccOrProtocolLine(line: string): boolean {
  const t = line.trim();
  if (t.length === 0) return true;
  if (t.startsWith("||")) return true;
  return false;
}

function emitLine(raw: string): void {
  if (!slot) return;
  const barcode = raw.replace(/\0/g, "").replace(/\r$/, "").trim();
  if (barcode.length === 0 || isLikelyDmccOrProtocolLine(barcode)) {
    if (barcode.length > 0) {
      console.log(`[tcp] Ignoring non-data line: ${barcode.slice(0, 120)}`);
    }
    return;
  }
  console.log(`[tcp] Barcode received: ${barcode}`);
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

export function triggerCognexAcquireOnce(): void {
  if (!connected || !socket || socket.destroyed) {
    return;
  }
  socket.write("||>TRIGGER ON\r\n");
}

function attachSocket(sock: net.Socket): void {
  sock.setEncoding("utf8");

  sock.setKeepAlive(true, 10000);

  sock.on("data", (chunk: string) => {
    console.log(`[tcp] Raw data received (${chunk.length} bytes):`, chunk);
    lineBuffer += chunk;
    consumeBuffer();
  });

  sock.on("error", (err) => {
    console.error("[tcp] Socket error:", err.message);
    connected = false;
  });

  sock.on("close", () => {
    console.log("[tcp] Connection closed");
    connected = false;

    if (lineBuffer.length > 0) {
      emitLine(lineBuffer);
      lineBuffer = "";
    }

    if (slot) {
      clearReconnectTimer();
      reconnectTimer = setTimeout(connectToScanner, RECONNECT_MS);
    }
  });
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
      sock.write("||>TRIGGER ON\r\n");
      resolve();
    });

    sock.once("timeout", () => {
      console.error("[tcp] Connection timeout");
      sock.destroy();
      reject(new Error("Connection timeout"));
    });

    sock.once("error", (err) => {
      console.error("[tcp] Connection error:", err.message);
      reject(err);
    });

    sock.connect(port, host);
  });
}

async function connectToScanner(): Promise<void> {
  try {
    clearReconnectTimer();

    if (!slot) {
      console.log("[tcp] No callback registered, waiting...");
      return;
    }

    const s = getScannerSettings();
    const host = s.ip?.trim() ?? "";
    const port = s.port;

    console.log(`[tcp] Attempting connection to ${host}:${port}`);

    if (!host || port == null || port < 1 || port > 65535) {
      console.error(`[tcp] Invalid settings: host="${host}", port=${port}`);
      connected = false;
      reconnectTimer = setTimeout(connectToScanner, RECONNECT_MS);
      return;
    }

    if (socket && !socket.destroyed) {
      socket.removeAllListeners();
      socket.destroy();
    }

    lineBuffer = "";
    const sock = new net.Socket();
    socket = sock;

    await connectScanner(sock, port, host);
    attachSocket(sock);
  } catch (err) {
    console.error(
      "[tcp] Failed to connect to scanner:",
      err instanceof Error ? err.message : err,
    );
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
