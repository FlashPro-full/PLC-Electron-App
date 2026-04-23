import axios from "axios";
import { getPurescanUrls } from "../persistence/purescanSettings";
import { getPushers } from "../persistence/beltSettings";
import { getProductCondition } from "../persistence/purescanSettings";

const LOGIN_TIMEOUT_MS = 90_000;
const LOGIN_RETRIES = 3;
const LOGIN_RETRY_DELAY_MS = 5000;

let pushers: Record<string, { label?: string; distance?: number }> = {};
let token: string | null = null;
let refreshPromise: Promise<boolean> | null = null;
let credential: { email: string; password: string } | null = null;
let condition: boolean = false;
let loginUrl: string | null = null;
let dataUrl: string | null = null;

export function setCondition(): void {
  condition = getProductCondition();
}

export async function setCredential(email: string, password: string): Promise<boolean> {
  credential = { email, password };
  return await initToken();
}

export function resolvedPurescan(): void {
  const urls = getPurescanUrls();
  loginUrl = urls.login_url;
  dataUrl = urls.data_url;
}

export function resetPurescanSession(): void {
  token = null;
  refreshPromise = null;
}

export function setPushersPurescan(): void {
  pushers = getPushers();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function initToken(): Promise<boolean> {
  if (!loginUrl || !credential) {
    console.log("No login url or credential");
    return false;
  }
  let lastErr: unknown;
  for (let attempt = 0; attempt < LOGIN_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), LOGIN_TIMEOUT_MS);
      try {
        const res = await axios.post(loginUrl, credential);
        if (res.data.result && res.data.token) {
          token = res.data.token;
          return true;
        }
        return false;
      } finally {
        clearTimeout(t);
      }
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
  return false;
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

export async function requestPurescan(barcode: string): Promise<{ pusher: number; label?: string; distance?: number } | { reason: string }> {
  if (!dataUrl) {
    return { reason: "Url not set" };
  }

  const scanUrl = dataUrl;

  let auth = token;
  if (!auth) {
    console.warn(`No token available for barcode ${barcode}`);
    return { reason: "No Token" };
  }

  const postOnce = async (bearer: string) => {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 5000);
    try {
      return await axios.post(
        scanUrl,
        { barcode: barcode, condition: condition },
        { 
          headers: { 
            Authorization: `Bearer ${bearer}` 
          } 
        }
      );
    } finally {
      clearTimeout(t);
    }
  };

  try {
    let res = await postOnce(auth);
    if (res.status === 200) {
      const label = labelFromPurescanResponse(res.data);
      return getPusherNumber(label) ?? { reason: "No Label" };
    }
    return { reason: "No response" };
  } catch (e: any) {
    if (e.response) {
      if (e.response.status === 401) {
        console.warn(`Token expired (401), refreshing for barcode ${barcode}`);
        token = null;
        const ok = await refreshTokenOnce();
        if (ok && token) {
          const res = await postOnce(token);
          if (res.status === 200) {
            const label = labelFromPurescanResponse(res.data);
            return getPusherNumber(label) ?? { reason: "No Label"};
          }
        } else return { reason: "No Token" };
      }
      if (e.response.status === 404) {
        console.warn(`Purescan 404 for ${barcode}: ${e.response.data.error}`);
        return getPusherNumber("Extra") ?? { reason: "Not Found" };
      }
      if (e.response.status === 500) {
        console.warn(`Purescan 500 for ${barcode}: ${e.response.data.error}`);
      }
    }
    return { reason: "No response" };
  }
}
