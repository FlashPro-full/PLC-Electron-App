import type { Server } from "socket.io";

let io: Server | null = null;
let beltSpeedGetter: () => number = () => 32.1;

export function configureRuntime(socketIo: Server, getBeltSpeed: () => number): void {
  io = socketIo;
  beltSpeedGetter = getBeltSpeed;
}

export function getBeltSpeed(): number {
  return beltSpeedGetter();
}

export function emitSocket(eventName: string, data: unknown): void {
  io?.emit(eventName, data);
}
