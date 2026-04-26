import { spawnSync } from "child_process";
import type { NotifyBackend, NotifyPayload } from "../types.js";

function escapeDouble(s: string): string {
  return s.replace(/"/g, '\\"');
}

function toAppleScriptStringExpr(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((part) => `"${escapeDouble(part)}"`)
    .join(" & linefeed & ");
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
      const sound = payload.sound ? ` sound name ${toAppleScriptStringExpr(payload.sound)}` : "";
      const script = `display notification ${toAppleScriptStringExpr(payload.body)} with title ${toAppleScriptStringExpr(payload.title)}${sound}`;
      spawnSync("osascript", ["-e", script], { stdio: "ignore" });
    }
  } catch {
    // swallow errors — notifications are best-effort
  }
}
