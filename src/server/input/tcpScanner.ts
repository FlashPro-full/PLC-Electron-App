import net from "net";
import { getScannerSettings } from "../persistence/deviceSettings";

let socket: net.Socket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let buffer = "";
let scanHandler: ((barcode: string) => void) | null = null;

function normalizeScannerMode(raw: string | null | undefined): "tcp" | "keyboard" {
  const s = (raw ?? "").trim().toLowerCase().replace(/\s+/g, "");
  if (s === "tcp/telnet" || s === "tcptelnet" || s === "optimal") {
    return "tcp";
  }
  return "keyboard";
}

function clearReconnectTimer(): void {
  if (reconnectTimer != null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect(): void {
  clearReconnectTimer();
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (scanHandler) {
      tryConnect(scanHandler);
    }
  }, 3000);
}

function tryConnect(onScanned: (barcode: string) => void): void {
  const s = getScannerSettings();
  if (normalizeScannerMode(s.mode) !== "tcp") {
    return;
  }
  const host = (s.ip ?? "").trim();
  const port =
    typeof s.port === "number" && !Number.isNaN(s.port) ? s.port : 0;
  if (!host || port <= 0) {
    console.warn("TCP scanner: missing ip or port");
    scheduleReconnect();
    return;
  }

  if (socket) {
    try {
      socket.destroy();
    } catch {}
    socket = null;
  }

  const c = net.createConnection({ host, port });
  socket = c;
  c.setEncoding("utf8");
  buffer = "";

  c.on("data", (chunk: string) => {
    buffer += chunk;
    const normalized = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const parts = normalized.split("\n");
    buffer = parts.pop() ?? "";
    for (const line of parts) {
      const t = line.trim();
      if (t.length > 0) {
        onScanned(t);
      }
    }
  });

  c.on("error", (err: NodeJS.ErrnoException) => {
    console.warn(`[plc-ts] TCP scanner ${host}:${port}: ${err.message}`);
    try {
      c.destroy();
    } catch {}
    socket = null;
    scheduleReconnect();
  });

  c.on("close", () => {
    socket = null;
    scheduleReconnect();
  });
}

export function connectTcpScanner(onScanned: (barcode: string) => void): void {
  scanHandler = onScanned;
  const s = getScannerSettings();
  if (normalizeScannerMode(s.mode) !== "tcp") {
    return;
  }
  clearReconnectTimer();
  tryConnect(onScanned);
}

export function isTcpScannerActive(): boolean {
  return socket != null && !socket.destroyed;
}
