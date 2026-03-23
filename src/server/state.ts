export const MAX_EVENT_QUEUE = 5000;

export interface BookItem {
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

export const bookDict = new Map<string, BookItem>();
export const barcodeQueue: BookItem[] = [];
export const eventQueue: Array<{ type: string; payload: unknown; ts?: number }> = [];

export function enqueueEvent(type: string, payload: unknown, ts?: number): void {
  if (eventQueue.length >= MAX_EVENT_QUEUE) {
    eventQueue.shift();
  }
  eventQueue.push({ type, payload, ts });
}
