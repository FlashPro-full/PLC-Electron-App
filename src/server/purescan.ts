import fs from "fs";
import path from "path";

const LOGIN_URL = process.env.PURESCAN_API_LOGIN_URL;
const DATA_URL = process.env.PURESCAN_API_DATA_URL;
const EMAIL = process.env.EMAIL;
const PASSWORD = process.env.PASSWORD;

const LOGIN_TIMEOUT_MS = 90_000;
const LOGIN_RETRIES = 3;
const LOGIN_RETRY_DELAY_MS = 5000;

let pushers: Record<string, { label?: string; distance?: number }> = {};
let token: string | null = null;
let refreshPromise: Promise<boolean> | null = null;

export function setPushersPurescan(): void {
  const settingsPath = path.join(process.cwd(), "settings.json");
  const raw = fs.readFileSync(settingsPath, "utf8");
  const settings = JSON.parse(raw) as { pushers: Record<string, { label?: string; distance?: number }> };
  pushers = settings.pushers || {};
}

export function initSession(): void {
  /* Python kept a requests.Session; fetch is stateless per call. */
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function initToken(): Promise<void> {
  if (!LOGIN_URL || !EMAIL || !PASSWORD) {
    return;
  }
  let lastErr: unknown;
  for (let attempt = 0; attempt < LOGIN_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), LOGIN_TIMEOUT_MS);
      const response = await fetch(LOGIN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
        signal: controller.signal,
      });
      clearTimeout(t);
      if (response.status === 200) {
        const data = (await response.json()) as { result?: boolean; token?: string };
        if (data.result && data.token) {
          token = data.token;
          return;
        }
      }
      return;
    } catch (e) {
      lastErr = e;
      if (attempt < LOGIN_RETRIES - 1) {
        await sleep(LOGIN_RETRY_DELAY_MS);
      }
    }
  }
  if (lastErr) {
    console.error("Failed to get PureScan token after retries:", lastErr);
  }
}

function getPusherNumber(label: string): { pusher: number; label?: string; distance?: number } | null {
  for (const [pusherName, config] of Object.entries(pushers)) {
    if (!config || typeof config !== "object") {
      continue;
    }
    if (config.label === label) {
      const match = /\d+/.exec(pusherName);
      if (match) {
        return {
          pusher: parseInt(match[0], 10),
          label: config.label,
          distance: config.distance,
        };
      }
    }
  }
  return null;
}

function labelFromPurescanResponse(productData: Record<string, unknown>): string {
  if (!productData.result) {
    return "Extra";
  }
  const scanResult = (productData.scanResult as Record<string, unknown>) || {};
  const product = (scanResult.product as Record<string, unknown>) || {};
  const fba = (scanResult.fba as Record<string, unknown>) || {};
  const mf = (scanResult.mf as Record<string, unknown>) || {};

  if (fba.accept === true) {
    return "FBA";
  }
  if (mf.accept === true) {
    return "MF";
  }
  const category = product.category as string | undefined;
  if (
    category !== "Book" &&
    category !== "DVD" &&
    category !== "Video Game" &&
    category !== "Music" &&
    category !== "Blu-ray"
  ) {
    return "Extra";
  }
  return `Reject ${category}`;
}

async function refreshTokenOnce(): Promise<boolean> {
  if (token) {
    return true;
  }
  if (refreshPromise) {
    return refreshPromise;
  }
  refreshPromise = (async () => {
    await initToken();
    return Boolean(token);
  })();
  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

export async function requestPurescan(barcode: string): Promise<{ pusher: number; label?: string; distance?: number } | null> {
  if (!DATA_URL) {
    return null;
  }

  let auth = token;
  if (!auth) {
    console.warn(`No token available for barcode ${barcode}`);
    return null;
  }

  const postOnce = async (bearer: string) => {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 5000);
    try {
      return await fetch(DATA_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${bearer}`,
        },
        body: JSON.stringify({ barcode }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(t);
    }
  };

  try {
    let response = await postOnce(auth);
    if (response.status === 200) {
      const productData = (await response.json()) as Record<string, unknown>;
      const label = labelFromPurescanResponse(productData);
      return getPusherNumber(label);
    }
    if (response.status === 401) {
      console.warn(`Token expired (401), refreshing for barcode ${barcode}`);
      token = null;
      const ok = await refreshTokenOnce();
      if (ok && token) {
        response = await postOnce(token);
        if (response.status === 200) {
          const productData = (await response.json()) as Record<string, unknown>;
          const label = labelFromPurescanResponse(productData);
          return getPusherNumber(label);
        }
      }
    }
    if (response.status === 404) {
      const body = await response.text().catch(() => "");
      console.warn(`Purescan 404 for ${barcode}: ${body}`);
      if (pushers["Extra"]) {
        return getPusherNumber("Extra");
      }
    }
    if (response.status === 500) {
      const body = await response.text().catch(() => "");
      console.warn(`Purescan 500 for ${barcode}: ${body}`);
    }
    return null;
  } catch (e) {
    console.error(`Purescan request error for ${barcode}:`, e);
    return null;
  }
}

