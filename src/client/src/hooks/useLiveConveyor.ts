import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

export type BeltSettingsType = {
  belt_speed: number;
  pushers: Record<string, { label?: string; distance?: number }>;
};

export type SystemStatusType = {
  plc?: { connected?: boolean; message?: string };
  scanner?: { connected?: boolean; message?: string };
  photo_eye?: { connected?: boolean; message?: string };
};

export type TrackedItem = {
  barcode: string;
  start_time?: number | string;
  positionId?: unknown;
  positionCm?: number | string;
  pusher?: unknown;
  label?: unknown;
  distance?: unknown;
  status?: string;
  created_at?: string;
  pusherActivated?: boolean;
};

function maxPusherDistanceCm(pushers: BeltSettingsType["pushers"] | undefined): number {
  const vals = Object.values(pushers || {}).map((p) => Number(p?.distance) || 0);
  return Math.max(972, ...vals);
}

export function useLiveConveyor(beltSettings: BeltSettingsType | null) {
  const [items, setItems] = useState<TrackedItem[]>([]);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    const worker = new Worker(new URL("../workers/socket-handler.worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data;
      if (!msg?.type) return;
      if (msg.type === "items_updated") {
        const next = (msg.items || []) as TrackedItem[];
        setItems(next);
        document.dispatchEvent(new CustomEvent("activeItemsUpdated", { detail: { items: next } }));
      } else if (msg.type === "pusher_activate" && msg.detail) {
        document.dispatchEvent(new CustomEvent("pusherActivate", { detail: msg.detail }));
      }
    };

    const socket = io();

    socket.on("add_book", (itemData: TrackedItem) => {
      if (itemData?.barcode) {
        worker.postMessage({ type: "add_book", item: itemData });
      }
    });

    socket.on("update_book", (data: TrackedItem) => {
      if (data) worker.postMessage({ type: "update_book", data });
    });

    worker.postMessage({ type: "start_tick" });

    return () => {
      worker.postMessage({ type: "stop_tick" });
      worker.terminate();
      workerRef.current = null;
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    const w = workerRef.current;
    if (!w || !beltSettings) return;
    const speed = Number(beltSettings.belt_speed);
    w.postMessage({
      type: "config",
      beltSpeed: speed > 0 ? speed : undefined,
      maxDistance: maxPusherDistanceCm(beltSettings.pushers),
    });
  }, [beltSettings]);

  return { items };
}
