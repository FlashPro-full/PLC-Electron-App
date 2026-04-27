export const MAX_EVENT_QUEUE = 100;

export interface productItem {
  barcode: string;
  start_time: number;
  positionId: number | null;
  positionCm: number | null;
  pusher: number | string | null;
  label: string | null;
  distance: number | null;
  status: string;
  created_at: string;
  push_time?: number | null;
}

export const productBuffer = new Map<string, productItem>();
export const tempQueue: productItem[] = [];
export const MAX_PENDING_SCAN = 16;
export const eventQueue: Array<{ type: string; payload: unknown; ts?: number }> = [];

export function enqueueEvent(type: string, payload: unknown, ts?: number): void {
  if (eventQueue.length >= MAX_EVENT_QUEUE) {
    eventQueue.shift();
  }
  eventQueue.push({ type, payload, ts });
}
