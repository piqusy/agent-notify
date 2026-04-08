import { spawnSync } from "child_process";
import type { NotifyPayload } from "../types.js";

export function sendLinux(payload: NotifyPayload): void {
  try {
    // notify-send doesn't support sound directly; ignore payload.sound
    spawnSync("notify-send", [payload.title, payload.body], { stdio: "ignore" });
  } catch {
    // swallow errors
  }
}
