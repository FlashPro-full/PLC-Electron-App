import {
  productBuffer,
  tempQueue,
  MAX_PENDING_SCAN,
  eventQueue,
  enqueueEvent,
  type productItem,
} from "./state";
import { emitSocket } from "./runtime";
import { markBarcodeActivity, writeBucket } from "../hardware/plc";
import { requestPurescan } from "../integrations/purescan";

const INTERVAL_MS = 100;
const MAX_EVENTS_PER_TICK = 300;
const MIN_PENDING_SCAN_TIMEOUT_SEC = 8;
const MAX_PENDING_SCAN_TIMEOUT_SEC = 45;
const DEFAULT_PENDING_SCAN_TIMEOUT_SEC = 15;

let timerStarted = false;
let lastErrorLog = 0;
let beltSpeed = 0;

export function setBeltSpeed(speed: number): void {
  beltSpeed = speed;
}

function nowSec(): number {
  return Date.now() / 1000;
}

function createdAtStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function effectiveBeltSpeed(): number {
  return beltSpeed > 0 ? beltSpeed : 1e-6;
}

function pendingScanTimeoutSec(): number {
  if (beltSpeed <= 0) {
    return DEFAULT_PENDING_SCAN_TIMEOUT_SEC;
  }
  const dynamic = 3 + (120 / beltSpeed);
  return Math.max(MIN_PENDING_SCAN_TIMEOUT_SEC, Math.min(MAX_PENDING_SCAN_TIMEOUT_SEC, dynamic));
}

async function handleEvent(event: { type: string; payload: unknown; ts?: number }, now: number): Promise<void> {
  const eventType = event.type;
  const payload = event.payload;
  const ts = event.ts ?? now;

  if (eventType === "barcode") {
    const barcode = payload as string;
    markBarcodeActivity();

    const item = {
      barcode: barcode,
      start_time: ts,
      positionId: null,
      positionCm: null,
      pusher: null,
      label: null,
      distance: null,
      status: "pending",
      created_at: createdAtStr(),
    };

    if (tempQueue.length >= MAX_PENDING_SCAN) {
      tempQueue.shift();
    }

    tempQueue.push(item);
    productBuffer.set(barcode, item);
    emitSocket("add_book", item);

    void requestPurescan(barcode).then(
      (response) => enqueueEvent("purescan_ok", { barcode, response }, nowSec()),
      (error: unknown) =>
        enqueueEvent("purescan_err", { barcode, error: String(error) }, nowSec())
    );
    return;
  }

  if (eventType === "photo_eye") {
    const positionId = payload as number | null;
    if (positionId == null) {
      return;
    }

    let emitData: productItem | null = null;

    if(tempQueue.length > 0) {
      const item = tempQueue.shift()!;
      if(item) {
        const barcode = item.barcode;
        if (productBuffer.has(barcode)) {
          const item = productBuffer.get(barcode)!;
          item.start_time = ts;
          item.positionId = positionId;
          if (item.distance === null) {
            item.status = "fetching";
          } else {
            item.status = "progress";
            item.push_time = ts + (item.distance / beltSpeed);
          }
          emitData = { ...item };
        }
      }
    }

    if(emitData) {
      emitSocket("update_book", emitData);
    }

    return;
  }

  if (eventType === "purescan_ok") {
    const pl = payload as { barcode: string; response: unknown };
    const barcode = pl.barcode;
    const response = pl.response as { pusher?: number; label?: string; distance?: number } | { reason: string };

    const isStatusOnly = "reason" in response && response.reason !== undefined;

    if (isStatusOnly) {
      let emitData: productItem | null = null;
      if (productBuffer.has(barcode)) {
        const b = productBuffer.get(barcode)!;
        b.status = "moving";
        b.label = response.reason;
        emitData = { ...b };
      }
      if (emitData) {
        emitSocket("update_book", emitData);
        productBuffer.delete(barcode);
      }
      return;
    }

    const details = response as { pusher?: number; label?: string; distance?: number };
    const label = details.label;
    const distance = details.distance;
    const pusher = details.pusher;
    let emitData: productItem | null = null;
    if (productBuffer.has(barcode)) {
      const b = productBuffer.get(barcode)!;
      b.pusher = pusher ?? null;
      b.label = label ?? null;
      b.distance = distance ?? null;
      if (distance != null && b.positionId != null) {
        b.status = "progress";
        b.push_time = b.start_time + distance / effectiveBeltSpeed();
      }
      emitData = { ...b };
    }
    if (emitData) {
      emitSocket("update_book", emitData);
    }
    return;
  }

  if (eventType === "purescan_err") {
    const pl = payload as { barcode: string };
    const barcode = pl.barcode;
    let emitData: productItem | null = null;
    if (productBuffer.has(barcode)) {
      const b = productBuffer.get(barcode)!;
      b.status = "moving";
      b.label = "No Response";
      emitData = { ...b };
    }
    if (emitData) {
      emitSocket("update_book", emitData);
      productBuffer.delete(barcode);
    }
    return;
  }
}

async function drainEvents(now: number): Promise<void> {
  let processed = 0;
  while (processed < MAX_EVENTS_PER_TICK) {
    const event = eventQueue.shift();
    if (!event) {
      return;
    }
    await handleEvent(event, now);
    processed++;
  }
}

async function onInterval100ms(): Promise<void> {
  const now = nowSec();
  await drainEvents(now);

  const pendingTimeoutSec = pendingScanTimeoutSec();
  while (tempQueue.length > 0 && now - tempQueue[0].start_time >= pendingTimeoutSec) {
    tempQueue.shift();
  }

  for (const [barcode, item] of productBuffer.entries()) {
    if (now - item.start_time > 60) {
      productBuffer.delete(barcode);
      continue;
    }
    const label = item.label;
    const labelIsNone = typeof label === "string" && label.trim().toLowerCase() === "none";
    if (
      item.status === "progress" &&
      item.push_time != null &&
      now >= item.push_time &&
      item.positionId != null &&
      item.pusher != null &&
      !labelIsNone
    ) {
      const result = await writeBucket(Number(item.pusher));
      if (result) {
        productBuffer.delete(barcode);
      }
    }
  }
}

export function startIntervalTimer(): void {
  if (timerStarted) {
    return;
  }
  timerStarted = true;

  const loop = async () => {
    const tickStart = Date.now();
    try {
      await onInterval100ms();
    } catch (e) {
      const t = nowSec();
      if (t - lastErrorLog >= 1) {
        lastErrorLog = t;
        console.error("timer loop error:", e);
      }
    }
    const elapsed = Date.now() - tickStart;
    setTimeout(loop, Math.max(0, INTERVAL_MS - elapsed));
  };

  setTimeout(loop, INTERVAL_MS);
}
