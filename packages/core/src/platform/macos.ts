import { execSync } from "child_process";
import type { NotifyBackend, NotifyPayload } from "../types.js";

function escapeDouble(s: string): string {
  return s.replace(/"/g, '\\"');
}

export function sendMacOS(payload: NotifyPayload, backend: NotifyBackend): void {
  try {
    if (backend === "terminal-notifier") {
      const args = [
        "terminal-notifier",
        `-title "${escapeDouble(payload.title)}"`,
        `-message "${escapeDouble(payload.body)}"`,
      ];
      if (payload.sound) {
        args.push(`-sound "${escapeDouble(payload.sound)}"`);
      }
      execSync(args.join(" "), { stdio: "ignore" });
    } else {
      // osascript
      const sound = payload.sound ? ` sound name "${escapeDouble(payload.sound)}"` : "";
      const script = `display notification "${escapeDouble(payload.body)}" with title "${escapeDouble(payload.title)}"${sound}`;
      execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, { stdio: "ignore" });
    }
  } catch {
    // swallow errors — notifications are best-effort
  }
}
