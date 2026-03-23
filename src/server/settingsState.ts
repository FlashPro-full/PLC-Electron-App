import { getBeltSpeedFromDb } from "./settingsDb";

export let beltSpeed = 32.1;

export function getBeltSpeedValue(): number {
  return beltSpeed;
}

export function reloadBeltSpeedFromDisk(): void {
  beltSpeed = getBeltSpeedFromDb();
}
