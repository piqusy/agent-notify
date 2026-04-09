import { spawnSync } from "child_process";
import type { NotifyBackend, NotifyPayload } from "../types.js";

function escapeDouble(s: string): string {
  return s.replace(/"/g, '\\"');
}

export function sendMacOS(payload: NotifyPayload, backend: NotifyBackend): void {
  try {
    if (backend === "terminal-notifier") {
      const args = ["-title", payload.title, "-message", payload.body];
      if (payload.sound) {
        args.push("-sound", payload.sound);
      }
      spawnSync("terminal-notifier", args, { stdio: "ignore" });
    } else {
      // osascript — use spawnSync with arg array to avoid any shell injection
      const sound = payload.sound ? ` sound name "${escapeDouble(payload.sound)}"` : "";
      const script = `display notification "${escapeDouble(payload.body)}" with title "${escapeDouble(payload.title)}"${sound}`;
      spawnSync("osascript", ["-e", script], { stdio: "ignore" });
    }
  } catch {
    // swallow errors — notifications are best-effort
  }
}
