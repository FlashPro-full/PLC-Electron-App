import {
  productBuffer,
  tempQueue,
  MAX_PENDING_SCAN,
  eventQueue,
  enqueueEvent,
  type productItem,
} from "./state";
import { emitSocket } from "./runtime";
import { writeBucket } from "../hardware/plc";
import { requestPurescan } from "../integrations/purescan";

const INTERVAL_MS = 100;
const MAX_EVENTS_PER_TICK = 300;

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

async function handleEvent(event: { type: string; payload: unknown; ts?: number }, now: number): Promise<void> {
  const eventType = event.type;
  const payload = event.payload;
  const ts = event.ts ?? now;

  if (eventType === "barcode") {
    const barcode = payload as string;

    if (productBuffer.has(barcode)) {
      return;
    }

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
      const item = tempQueue.pop();
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
            item.push_time = ts + (item.distance / effectiveBeltSpeed());
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
        b.positionId = b.positionId ?? null;
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
      if (b.status === "fetching") {
        b.status = "progress";
        b.push_time = b.start_time + (distance ?? 0) / effectiveBeltSpeed();
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
      b.positionId = b.positionId ?? null;
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

  while (tempQueue.length > 0 && now - tempQueue[0].start_time >= 1.5) {
    const barcode = tempQueue.shift()!.barcode;
    if (productBuffer.has(barcode)) {
      productBuffer.delete(barcode);
    }
  }

  for (const [barcode, item] of productBuffer.entries()) {
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
