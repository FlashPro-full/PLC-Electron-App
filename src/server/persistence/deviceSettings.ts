import fs from "fs";
import path from "path";

const DEVICE_FILE = "device.json";

const DEFAULT_DEVICE_SETTINGS = {
  plc: { 
    ip: null,
    port: null,
  },
  scanner: { 
    mode: "KEYBOARD",
    ip: null,
    port: null
  }
};

type DeviceSettingsType = {
  plc: { 
    ip: string | null; 
    port: number | null 
  };
  scanner: { 
    mode: "KEYBOARD" | "TCP/TELNET";
    ip: string | null;
    port: number | null
  };
};

type PLCSettingsType = {
  ip: string | null;
  port: number | null;
};

type ScannerSettingsType = {
  mode: "KEYBOARD" | "TCP/TELNET";
  ip: string | null;
  port: number | null;
};

export function ensureDeviceSettingsFile(): void {
  try {
    const p = path.join(process.cwd(), DEVICE_FILE);
    if (!fs.existsSync(p)) {
      fs.writeFileSync(p, JSON.stringify(DEFAULT_DEVICE_SETTINGS, null, 2), "utf8");
    }
  } catch (err) {
    console.error(`Error ensuring device file: ${err}`);
  }
}

export function getDeviceSettings(): DeviceSettingsType {
  try {
    const p = path.join(process.cwd(), DEVICE_FILE);
    if (!fs.existsSync(p)) {
      return DEFAULT_DEVICE_SETTINGS as DeviceSettingsType;
    }
    const raw = fs.readFileSync(p, "utf8");
    return JSON.parse(raw) as DeviceSettingsType;
  } catch (err) {
    console.error(`Error getting device settings: ${err}`);
    return DEFAULT_DEVICE_SETTINGS as DeviceSettingsType;
  }
}

export function getPLCSettings(): PLCSettingsType {
  try {
    return getDeviceSettings().plc;
  } catch (err) {
    console.error(`Error getting PLC settings: ${err}`);
    return DEFAULT_DEVICE_SETTINGS.plc as PLCSettingsType;
  }
}

export function getScannerSettings(): ScannerSettingsType {
  try {
    return getDeviceSettings().scanner;
  } catch (err) {
    console.error(`Error getting scanner settings: ${err}`);
    return DEFAULT_DEVICE_SETTINGS.scanner as ScannerSettingsType;
  }
}

export function updateDeviceSettings(deviceSettings: DeviceSettingsType): void {
  try {
    const p = path.join(process.cwd(), DEVICE_FILE);
    fs.writeFileSync(p, JSON.stringify(deviceSettings, null, 2), "utf8");
  } catch (err) {
    console.error(`Error updating scanner settings: ${err}`);
  }
}