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

function emitLine(raw: string): void {
  if (!slot) return;
  const barcode = raw.replace(/\0/g, "").replace(/\r$/, "").trim();
  if (barcode.length > 0) {
    slot(barcode);
  }
}

function consumeBuffer(): void {
  let i: number;
  while ((i = lineBuffer.indexOf("\n")) >= 0) {
    const line = lineBuffer.slice(0, i);
    lineBuffer = lineBuffer.slice(i + 1);
    emitLine(line);
  }
  if (lineBuffer.length > MAX_BUFFER) {
    lineBuffer = "";
  }
}

function attachSocket(sock: net.Socket): void {
  sock.setEncoding("utf8");
  sock.on("data", (chunk: string) => {
    lineBuffer += chunk;
    consumeBuffer();
  });
  sock.on("error", (err) => {
    console.error("[tcp] cognex:", err.message);
    connected = false;
  });
  sock.on("close", () => {
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

function connectToScanner(): void {
  clearReconnectTimer();
  if (!slot) {
    return;
  }
  const s = getScannerSettings();
  const host = s.ip?.trim() ?? "";
  const port = s.port;
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
  const sock = new net.Socket();
  socket = sock;
  attachSocket(sock);

  sock.connect(port, host, () => {
    connected = true;
  });
}

export function connectTcp(onBarcode: (barcode: string) => void): void {
  slot = onBarcode;
  clearReconnectTimer();
  connectToScanner();
}

export function isTcpScannerActive(): boolean {
  return connected;
}
