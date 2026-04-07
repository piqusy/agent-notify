import { execSync } from "child_process";
import type { NotifyPayload } from "../types.js";

export function sendLinux(payload: NotifyPayload): void {
  try {
    const args = ["notify-send"];
    if (payload.sound) {
      // notify-send doesn't support sound directly; ignore
    }
    args.push(`"${payload.title.replace(/"/g, '\\"')}"`, `"${payload.body.replace(/"/g, '\\"')}"`);
    execSync(args.join(" "), { stdio: "ignore" });
  } catch {
    // swallow errors
  }
}
