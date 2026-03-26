import type { Server } from "socket.io";

let io: Server | null = null;

export function configureRuntime(socketIo: Server): void {
  io = socketIo;
}

export function emitSocket(eventName: string, data: unknown): void {
  io?.emit(eventName, data);
}
