import { spawnSync } from "child_process";
import type { NotifyBackend, NotifyPayload } from "../types.js";

function escapeDouble(s: string): string {
  return s.replace(/"/g, '\\"');
}

function helperArgs(payload: NotifyPayload): string[] {
  const args = ["--title", payload.title, "--body", payload.body];

  if (payload.sound) {
    args.push("--sound", payload.sound);
  }

  const debugLog = process.env.AGENT_NOTIFY_MACOS_HELPER_LOG;
  if (debugLog) {
    args.push("--log-file", debugLog);
  }

  return args;
}

export function sendMacOS(
  payload: NotifyPayload,
  backend: NotifyBackend,
  options: { helperAppPath?: string } = {},
): void {
  try {
    if (backend === "macos-helper") {
      if (!options.helperAppPath) return;
      spawnSync("open", ["-n", options.helperAppPath, "--args", ...helperArgs(payload)], { stdio: "ignore" });
    } else {
      const sound = payload.sound ? ` sound name "${escapeDouble(payload.sound)}"` : "";
      const script = `display notification "${escapeDouble(payload.body)}" with title "${escapeDouble(payload.title)}"${sound}`;
      spawnSync("osascript", ["-e", script], { stdio: "ignore" });
    }
  } catch {
    // swallow errors — notifications are best-effort
  }
}
