import express from "express";
import fs from "fs";
import http from "http";
import path from "path";
import { Server as IOServer } from "socket.io";
import { bookDict } from "./state";
import { isPlcConnected, readPhotoEye, setPushersPlc, writeBucket } from "./plc";
import { setPushersPurescan } from "./purescan";
import { reloadBeltSpeedFromDisk } from "./settingsState";
import { setBeltSpeedInDb } from "./settingsDb";
import { isConfiguredWedgeScannerPresent } from "./scannerPresence";
import { isKeyboardListenerActive } from "./keyboard";
import { bootstrapBackend } from "./bootstrap";

function scannerStatusMessage(scannerOk: boolean, hwMonitored: boolean): string {
  if (hwMonitored) {
    return scannerOk ? "USB scanner present" : "USB scanner not found";
  }
  const mode = (process.env.SCAN_MODE || "KEYBOARD").toUpperCase();
  if (mode === "KEYBOARD") {
    return scannerOk ? "Keyboard capture on" : "Keyboard capture off";
  }
  return scannerOk ? "Connected" : "Disconnected";
}

async function checkConnections(): Promise<{
  plc: boolean;
  barcode_scanner: boolean;
  scanner_hw_monitored: boolean;
  photo_eye: { connected: boolean; message: string };
}> {
  const plcStatus = isPlcConnected();
  const hwScanner = isConfiguredWedgeScannerPresent();
  let barcodeStatus: boolean;
  let scannerHwMonitored: boolean;
  if (hwScanner !== null) {
    barcodeStatus = hwScanner;
    scannerHwMonitored = true;
  } else {
    barcodeStatus = isKeyboardListenerActive();
    scannerHwMonitored = false;
  }

  let photoEyeStatus = false;
  let photoEyeValue: number | null = null;
  if (plcStatus) {
    try {
      photoEyeValue = await readPhotoEye();
      photoEyeStatus = photoEyeValue != null;
    } catch {
      photoEyeStatus = false;
    }
  }

  return {
    plc: plcStatus,
    barcode_scanner: barcodeStatus,
    scanner_hw_monitored: scannerHwMonitored,
    photo_eye: {
      connected: photoEyeStatus,
      message: photoEyeValue == null ? "Not Ready" : "Ready",
    },
  };
}

async function systemStatusForClient(): Promise<Record<string, unknown>> {
  const status = await checkConnections();
  const hw = Boolean(status.scanner_hw_monitored);
  return {
    plc: {
      connected: status.plc,
      message: status.plc ? "Connected" : "Disconnected",
    },
    scanner: {
      connected: status.barcode_scanner,
      message: scannerStatusMessage(status.barcode_scanner, hw),
      mode: process.env.SCAN_MODE || "KEYBOARD",
    },
    photo_eye: status.photo_eye,
  };
}

export function createPlcHttpServer(publicDir: string): {
  httpServer: http.Server;
  io: IOServer;
  start: (port: number, host: string) => Promise<void>;
} {
  const app = express();
  app.use(express.json());
  app.use("/static", express.static(path.join(publicDir, "static")));

  app.get("/", (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });

  app.get("/settings", (_req, res) => {
    res.sendFile(path.join(publicDir, "settings.html"));
  });

  app.get("/api/system-status", async (_req, res) => {
    try {
      res.json(await systemStatusForClient());
    } catch {
      res.status(500).json({
        plc: { connected: false, message: "Error" },
        scanner: { connected: false, message: "Error" },
        photo_eye: { connected: false, message: "Error" },
      });
    }
  });

  app.get("/book-dict", (_req, res) => {
    const items = Object.fromEntries(bookDict);
    res.json({ items, timestamp: new Date().toISOString() });
  });

  app.get("/test-integration", (_req, res) => {
    res.json({
      overall_status: "warning",
      timestamp: new Date().toISOString(),
      summary: { passed: 0, failed: 0, warnings: 0, skipped: 1 },
      tests: {
        ts_stub: {
          name: "PLC-TS backend",
          status: "skipped",
          message: "Full integration suite not ported from Python; use manual checks.",
          details: {},
        },
      },
    });
  });

  app.get("/get-settings", (_req, res) => {
    try {
      const raw = fs.readFileSync(path.join(process.cwd(), "settings.json"), "utf8");
      res.json(JSON.parse(raw));
    } catch {
      res.json({});
    }
  });

  app.post("/update-pushers", (req, res) => {
    const data = req.body || {};
    const pushers = data.pushers;
    if (!pushers || typeof pushers !== "object") {
      res.status(400).json({ error: "Invalid input format" });
      return;
    }
    try {
      const settingsPath = path.join(process.cwd(), "settings.json");
      const raw = fs.readFileSync(settingsPath, "utf8");
      const settings = JSON.parse(raw) as Record<string, unknown>;
      const next = { ...settings, pushers };
      fs.writeFileSync(settingsPath, JSON.stringify(next, null, 2), "utf8");
      setPushersPlc();
      setPushersPurescan();
      res.json({ message: "Pushers updated successfully!" });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.post("/trigger-pusher", async (req, res) => {
    const data = req.body || {};
    const pusher = parseInt(String(data.pusher ?? "0"), 10);
    if (Number.isNaN(pusher) || pusher < 1 || pusher > 8) {
      res.status(400).json({ error: "Invalid pusher number" });
      return;
    }
    try {
      const result = await writeBucket(pusher);
      if (result === 1) {
        res.json({ message: `Pusher ${pusher} triggered` });
      } else {
        res.status(500).json({ error: "Trigger failed" });
      }
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.post("/update-belt-speed", (req, res) => {
    const data = req.body || {};
    const speed = parseFloat(String(data.speed ?? "0"));
    if (Number.isNaN(speed) || speed <= 0) {
      res.status(400).json({ error: "Invalid speed value" });
      return;
    }
    try {
      const settingsPath = path.join(process.cwd(), "settings.json");
      const raw = fs.readFileSync(settingsPath, "utf8");
      const settings = JSON.parse(raw) as Record<string, unknown>;
      const next = { ...settings, belt_speed: speed };
      fs.writeFileSync(settingsPath, JSON.stringify(next, null, 2), "utf8");
      setBeltSpeedInDb(speed);
      reloadBeltSpeedFromDisk();
      res.json({ message: "Belt speed updated successfully!" });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  const httpServer = http.createServer(app);
  const io = new IOServer(httpServer, { cors: { origin: "*" } });

  io.on("connection", async (socket) => {
    try {
      socket.emit("system_status", await systemStatusForClient());
    } catch {
      /* ignore */
    }
  });

  return {
    httpServer,
    io,
    start: async (port: number, host: string) => {
      await bootstrapBackend(io);
      await new Promise<void>((resolve, reject) => {
        httpServer.once("error", reject);
        httpServer.listen(port, host, () => resolve());
      });
    },
  };
}
