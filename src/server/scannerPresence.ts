import { execFileSync } from "child_process";
import os from "os";

function normalizeHexId(value: string, width: number): string {
  let v = value.trim().toUpperCase();
  if (v.startsWith("0X")) {
    v = v.slice(2);
  }
  if (!/^[0-9A-F]{1,8}$/.test(v)) {
    throw new Error(`Invalid hex id: ${value}`);
  }
  const padded = v.padStart(width, "0");
  return padded.slice(-width).toUpperCase();
}

function keyboardInstanceIdsWindows(): string[] | null {
  if (os.platform() !== "win32") {
    return null;
  }
  const ps =
    "Get-PnpDevice -Class 'Keyboard' -Status OK " + "| ForEach-Object { $_.InstanceId }";
  try {
    const out = execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", ps], {
      encoding: "utf8",
      timeout: 15_000,
      windowsHide: true,
    });
    const lines = out
      .split(/\r?\n/)
      .map((ln) => ln.trim())
      .filter(Boolean);
    return lines;
  } catch {
    return null;
  }
}

export function isConfiguredWedgeScannerPresent(): boolean | null {
  const sub = process.env.SCANNER_PNP_INSTANCE_SUBSTRING?.trim() || "";
  const vidRaw = process.env.SCANNER_USB_VID?.trim() || "";
  const pidRaw = process.env.SCANNER_USB_PID?.trim() || "";

  if (!sub && (!vidRaw || !pidRaw)) {
    return null;
  }

  const ids = keyboardInstanceIdsWindows();
  if (!ids) {
    return null;
  }

  const haystacks = ids.map((i) => i.toUpperCase());

  if (sub) {
    const needle = sub.toUpperCase();
    return haystacks.some((h) => h.includes(needle));
  }

  try {
    const vid = normalizeHexId(vidRaw, 4);
    const pid = normalizeHexId(pidRaw, 4);
    const needle = `VID_${vid}&PID_${pid}`;
    return haystacks.some((h) => h.includes(needle));
  } catch {
    return null;
  }
}
