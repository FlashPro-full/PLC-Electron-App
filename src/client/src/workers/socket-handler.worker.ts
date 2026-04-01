/// <reference lib="webworker" />

const COMPLETION_OFFSET = 3.21;
const UPDATE_INTERVAL = 100;
const DEFAULT_BELT_SPEED = 32.1;
const DEFAULT_MAX_DISTANCE = 972;
const FETCH_TIMEOUT_SEC = 5;

type ItemState = Record<string, unknown> & { barcode?: string; pusherActivated?: boolean };

let items: Record<string, ItemState> = {};
let beltSpeed = DEFAULT_BELT_SPEED;
let maxDistance = DEFAULT_MAX_DISTANCE;
let tickTimerId: ReturnType<typeof setInterval> | null = null;

function normalizeItemFromAdd(itemData: Record<string, unknown>): ItemState {
  return {
    barcode: itemData.barcode as string | undefined,
    start_time: itemData.start_time,
    positionId: itemData.positionId,
    positionCm: itemData.positionCm,
    pusher: itemData.pusher,
    label: itemData.label,
    distance: itemData.distance,
    status: itemData.status,
    created_at: itemData.created_at,
    pusherActivated: false,
  };
}

function normalizeItemFromUpdate(data: Record<string, unknown>): ItemState {
  return {
    barcode: data.barcode as string | undefined,
    start_time: data.start_time,
    positionId: data.positionId,
    positionCm: data.positionCm,
    pusher: data.pusher,
    label: data.label,
    distance: data.distance,
    status: data.status || "pending",
    created_at: data.created_at,
    pusherActivated: false,
  };
}

function itemsToArray(): ItemState[] {
  return Object.keys(items).map((barcode) => {
    const item = items[barcode];
    return { barcode, ...item };
  });
}

function runPositionUpdate() {
  const currentTime = Date.now() / 1000;
  const itemsToRemove: string[] = [];
  const pusherActivates: { barcode: string; pusher: unknown; distance: unknown }[] = [];

  Object.keys(items).forEach((barcode) => {
    const item = items[barcode];
    if (item.status === "routing" || item.status === "completed") {
      if (item.start_time == null) {
        item.start_time = currentTime;
      }
      const routingDuration = currentTime - (item.start_time as number);
      if (routingDuration >= 1.5) {
        itemsToRemove.push(barcode);
      }
      return;
    }

    if (item.status === "pending" || item.status === "forward") {
      if (item.start_time != null) {
        const startTime =
          typeof item.start_time === "string" ? parseFloat(item.start_time) : (item.start_time as number);
        const elapsed = currentTime - startTime;
        if (elapsed >= 0) {
          const speed = beltSpeed > 0 ? beltSpeed : DEFAULT_BELT_SPEED;
          const locationCm = elapsed * speed;
          if (locationCm >= maxDistance) {
            itemsToRemove.push(barcode);
          }
        }
      }
      return;
    }

    if (item.status === "fetching" && item.start_time != null) {
      const startTime =
        typeof item.start_time === "string" ? parseFloat(item.start_time) : (item.start_time as number);
      const elapsed = currentTime - startTime;
      if (elapsed >= FETCH_TIMEOUT_SEC) {
        item.status = "forward";
        item.start_time = currentTime;
      }
      return;
    }

    if (item.status !== "progress" || !item.positionId || item.start_time == null) {
      return;
    }

    const startTime =
      typeof item.start_time === "string" ? parseFloat(item.start_time) : (item.start_time as number);
    const elapsed = currentTime - startTime;
    if (elapsed < 0) return;

    const speed = beltSpeed > 0 ? beltSpeed : DEFAULT_BELT_SPEED;
    item.positionCm = elapsed * speed;
    const positionCm = item.positionCm as number;
    const distance = item.distance !== undefined && item.distance !== null ? parseFloat(String(item.distance)) : null;
    const removalThresholdCm = distance !== null ? distance - COMPLETION_OFFSET : maxDistance - COMPLETION_OFFSET;
    const backendPushTimeElapsed = distance !== null && speed > 0 ? distance / speed : null;

    if (distance !== null && positionCm >= distance - COMPLETION_OFFSET && !item.pusherActivated) {
      item.pusherActivated = true;
      pusherActivates.push({ barcode, pusher: item.pusher, distance });
    }
    if (backendPushTimeElapsed !== null && elapsed >= backendPushTimeElapsed) {
      itemsToRemove.push(barcode);
    } else if (distance === null && positionCm >= removalThresholdCm) {
      itemsToRemove.push(barcode);
    }
  });

  itemsToRemove.forEach((barcode) => {
    delete items[barcode];
  });

  self.postMessage({ type: "items_updated", items: itemsToArray() });
  pusherActivates.forEach((ev) => {
    self.postMessage({ type: "pusher_activate", detail: ev });
  });
}

function startTickLoop() {
  if (tickTimerId !== null) return;
  tickTimerId = setInterval(runPositionUpdate, UPDATE_INTERVAL);
}

function stopTickLoop() {
  if (tickTimerId !== null) {
    clearInterval(tickTimerId);
    tickTimerId = null;
  }
}

self.onmessage = (e: MessageEvent<{ type: string; [k: string]: unknown }>) => {
  const msg = e.data;
  if (!msg || !msg.type) return;

  switch (msg.type) {
    case "config":
      if (msg.beltSpeed != null) beltSpeed = Number(msg.beltSpeed) || DEFAULT_BELT_SPEED;
      if (msg.maxDistance != null) maxDistance = Number(msg.maxDistance) || DEFAULT_MAX_DISTANCE;
      if (msg.startTick) startTickLoop();
      break;

    case "add_book": {
      const itemData = msg.item as Record<string, unknown> | undefined;
      if (itemData && itemData.barcode) {
        items[String(itemData.barcode)] = normalizeItemFromAdd(itemData);
        self.postMessage({ type: "items_updated", items: itemsToArray() });
      }
      break;
    }

    case "update_book": {
      const data = msg.data as Record<string, unknown> | undefined;
      if (data && data.barcode) {
        const bc = String(data.barcode);
        let existing = items[bc];
        if (!existing) {
          items[bc] = normalizeItemFromUpdate(data);
        } else {
          if (data.positionId != null) existing.positionId = data.positionId;
          if (data.status != null) existing.status = data.status;
          if (data.start_time != null) existing.start_time = data.start_time;
          if (data.pusher != null) existing.pusher = data.pusher;
          if (data.label != null) existing.label = data.label;
          if (data.distance != null) existing.distance = data.distance;
        }
        self.postMessage({ type: "items_updated", items: itemsToArray() });
      }
      break;
    }

    case "start_tick":
      startTickLoop();
      break;

    case "stop_tick":
      stopTickLoop();
      break;
    default:
      break;
  }
};

export {};
