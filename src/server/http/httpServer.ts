import express from "express";
import http from "http";
import { Server as IOServer } from "socket.io";
import { bootstrapBackend } from "../core/bootstrap";
import { setCredential, setPushersPurescan } from "../integrations/purescan";
import { getPurescanCredential, updateProductCondition, updatePurescanCredentials } from "../persistence/purescanSettings";
import { getDeviceSettings, updateDeviceSettings } from "../persistence/deviceSettings";
import { getBeltSettings, updateBeltSpeed, updateDistance, updatePushers } from "../persistence/beltSettings";
import { setBeltSpeed } from "../core/timer";
import { isPlcConnected, setPushersPlc } from "../hardware/plc";
import { getScannerSettings } from "../persistence/deviceSettings";
import { isTcpScannerActive } from "../input/tcp";
import { isKeyboardListenerActive } from "../input/keyboard";
import { writeBucket } from "../hardware/plc";

type SystemStatusType= {
  plc?: { connected?: boolean; message?: string };
  scanner?: { connected?: boolean; message?: string };
  photo_eye?: { connected?: boolean; message?: string };
};

function buildSystemStatus(): SystemStatusType {
  const plcOk = isPlcConnected();
  const plc: SystemStatusType["plc"] = {
    connected: plcOk,
    message: plcOk ? "Active" : "Inactive"
  };
  const scan = getScannerSettings();
  const mode = (scan.mode ?? "").trim().toLowerCase().replace(/\s+/g, "");
  const tcpMode = mode === "tcp/telnet";
  let scanner: SystemStatusType["scanner"];
  console.log(`Scanner mode: ${mode}, TCP mode: ${tcpMode}`);
  if (tcpMode) {
    const ok = isTcpScannerActive();
    console.log(`TCP scanner active: ${ok}`);
    scanner = { connected: ok, message: ok ? "Active" : "Inactive" };
  } else {
    const ok = isKeyboardListenerActive();
    scanner = { connected: ok, message: ok ? "Active" : "Inactive" };
  }
  const photo_eye: SystemStatusType["photo_eye"] = {
    connected: plcOk,
    message: plcOk ? "Active" : "Inactive"
  };
  return { plc, scanner, photo_eye };
}

export function createHttpServer(clientDir: string): {
  app: express.Application;
  server: http.Server;
} {
  const app = express();
  const server = http.createServer(app);
  const io = new IOServer(server);

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(clientDir));

  app.get("/api/health", (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.get("/api/purescan", async (_req, res) => {
    const { email, password } = getPurescanCredential();
    return res.status(200).json({ result: true, credential: { email, password } });
  });

  app.post("/api/purescan", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }
      const result = await setCredential(email, password);
      if (result) {
        updatePurescanCredentials(email, password);
        return res.status(200).json({ result: true });
      } else {
        return res.status(401).json({ error: "Invalid email or password" });
      }
    } catch (err) {
      console.error("Purescan login error:", err);
      return res.status(500).json({ result: false });
    }
  });

  app.get("/api/device", async (_req, res) => {
    try {
      const deviceConfig = getDeviceSettings();
      return res.status(200).json({ result: true, config: deviceConfig });
    } catch (err) {
      console.error("Device config error:", err);
      return res.status(500).json({ result: false });
    }
  });

  app.put("/api/device", async (req, res) => {
    try {
      updateDeviceSettings(req.body);
      return res.status(200).json({ result: true });
    } catch (err) {
      console.error("Device config error:", err);
      return res.status(500).json({ result: false });
    }
  });

  app.get("/api/notify", async (_req, res) => {
    try {
      await bootstrapBackend(io);
      const status = buildSystemStatus();
      const settings = getBeltSettings();
      return res.status(200).json({
        result: true,
        status,
        settings
      });
    } catch (err) {
      console.error("Notification error:", err);
      return res.status(500).json({ result: false });
    }
  });

  app.post("/api/toggle-new-used", async (req, res) => {
    try {
      const condition = req.body?.condition;
      console.log(condition);
      updateProductCondition(condition);
      res.status(200).json({
        result: true
      });
    } catch (err) {
      console.error("toggle error: ", err);
      return res.status(500).json({ result: false });
    }
  });

  app.get("/api/settings", async(_req, res) => {
    try {
      const settings = getBeltSettings();
      return res.status(200).json({ result: true, settings });
    } catch (err) {
      console.error("Settings error:", err);
      return res.status(500).json({ result: false });
    }
  });

  app.post("/api/settings/trigger", async (req, res) => {
    try {
      const pusher = req.body.pusher;
      const result = await writeBucket(pusher);
      if(result) {
        res.status(200).json({ result: true });
      } else {
        res.status(200).json({ result: false });
      } 
    } catch (err) {
      console.error("Settings error:", err);
      return res.status(500).json({ result: false });
    }
  });

  app.put("/api/settings/belt-speed", async (req, res) => {
    try {
      updateBeltSpeed(req.body.speed);
      setBeltSpeed(req.body.speed);
      return res.status(200).json({ result: true });
    } catch (err) {
      console.error("Belt speed error:", err);
      return res.status(500).json({ result: false });
    }
  });

  app.put("/api/settings/distance", async (req, res) => {
    try {
      updateDistance(req.body.distance);
      return res.status(200).json({ result: true });
    } catch (err) {
      console.error("Distance error:", err);
      return res.status(500).json({ result: false });
    }
  });

  app.put("/api/settings/pushers", async (req, res) => {
    try {
      updatePushers(req.body.pushers);
      setPushersPlc();
      setPushersPurescan();
      return res.status(200).json({ result: true });
    } catch (err) {
      console.error("Pushers error:", err);
      return res.status(500).json({ result: false });
    }
  });
  return { app, server };
}
