import path from "path";
import fs from "fs";

export const PURESCAN_FILE = "purescan.json";

export const PURESCAN_DEFAULT_LOGIN_URL = "https://purescan-backend-gnos.onrender.com/api/auth/login";
export const PURESCAN_DEFAULT_DATA_URL = "https://purescan-backend-gnos.onrender.com/api/scan";

type purescanSettingsType = {
  email_b64: string | null;
  password_b64: string | null;
  login_url: string;
  data_url: string;
};

function encodeCredentialField(plain: string): string | null {
  if (!plain || !String(plain).trim()) {
    return null;
  }
  try {
    return Buffer.from(plain, "utf8").toString("base64");
  } catch {
    return null;
  }
}

function decodeCredentialField(b64: string): string | null {
  if (!b64 || !String(b64).trim()) {
    return null;
  }
  try {
    return Buffer.from(b64, "base64").toString("utf8");
  } catch {
    return null;
  }
}

export function ensurePurescanSettingsFile(): void {
  try {
    const p = path.join(process.cwd(), PURESCAN_FILE);
    if (!fs.existsSync(p)) {
      fs.writeFileSync(p, JSON.stringify({
        email_b64: null,
        password_b64: null,
        login_url: PURESCAN_DEFAULT_LOGIN_URL,
        data_url: PURESCAN_DEFAULT_DATA_URL,
      }, null, 2), "utf8");
    }
  } catch (err) {
    console.error(`Error ensuring purescan file: ${err}`);
  }
}

export function getPurescanUrls(): { login_url: string; data_url: string } {
  try {
    const p = path.join(process.cwd(), PURESCAN_FILE);
    const raw = fs.readFileSync(p, "utf8");
    const purescan = JSON.parse(raw) as purescanSettingsType;
    return { login_url: purescan.login_url, data_url: purescan.data_url };
  }
  catch (err) {
    console.error(`Error getting purescan urls: ${err}`);
    return { login_url: PURESCAN_DEFAULT_LOGIN_URL, data_url: PURESCAN_DEFAULT_DATA_URL };
  }
}

export function getPurescanCredential(): { email: string | null; password: string | null } {
  try {
    const p = path.join(process.cwd(), PURESCAN_FILE);
    const raw = fs.readFileSync(p, "utf8");
    const purescan = JSON.parse(raw) as purescanSettingsType;
    return {
      email: purescan.email_b64 ? decodeCredentialField(purescan.email_b64) : null,
      password: purescan.password_b64 ? decodeCredentialField(purescan.password_b64) : null,
    };
  } catch (err) {
    console.error(`Error getting purescan credentials: ${err}`);
    return { email: null, password: null };
  }
}

export function updatePurescanCredentials(email: string, password: string): void {
  try {
    const p = path.join(process.cwd(), PURESCAN_FILE);
    const raw = fs.readFileSync(p, "utf8");
    const purescan = JSON.parse(raw) as purescanSettingsType;
    purescan.email_b64 = email ? encodeCredentialField(email) : null;
    purescan.password_b64 = password ? encodeCredentialField(password) : null;
    fs.writeFileSync(p, JSON.stringify(purescan, null, 2), "utf8");
  } catch (err) {
    console.error(`Error updating purescan credentials: ${err}`);
  }
}