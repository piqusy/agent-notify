import { spawnSync } from "child_process";
import { appendFileSync } from "fs";
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

function writeDebugLog(payload: Record<string, unknown>): void {
  const file = process.env.AGENT_NOTIFY_DEBUG_LOG?.trim();
  if (!file) return;

  try {
    appendFileSync(file, `${JSON.stringify({
      timestamp: Date.now(),
      pid: process.pid,
      source: "core:macos",
      ...payload,
    })}\n`, "utf8");
  } catch {
    // debug logging must never affect notification flow
  }
}

function helperArgs(payload: NotifyPayload): string[] {
  const args = ["--title", payload.title, "--body", payload.body];

  if (payload.sound) {
    args.push("--sound", payload.sound);
  }

  if (payload.clickTarget) {
    args.push("--click-target", Buffer.from(JSON.stringify(payload.clickTarget), "utf8").toString("base64"));
  }

  if (payload.macosHelperKeepAliveSeconds && payload.macosHelperKeepAliveSeconds > 0) {
    args.push("--keep-alive-seconds", String(payload.macosHelperKeepAliveSeconds));
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
      if (!options.helperAppPath) {
        writeDebugLog({ event: "macos-helper-skip", reason: "missing-helper-app-path" });
        return;
      }

      writeDebugLog({
        event: "macos-helper-launch-start",
        title: payload.title,
        hasSound: Boolean(payload.sound),
        hasClickTarget: Boolean(payload.clickTarget),
      });

      const result = spawnSync("open", ["-n", options.helperAppPath, "--args", ...helperArgs(payload)], { stdio: "ignore" });

      writeDebugLog({
        event: "macos-helper-launch-end",
        status: result.status ?? null,
        error: result.error ? String(result.error) : null,
      });
    } else {
      const sound = payload.sound ? ` sound name ${toAppleScriptStringExpr(payload.sound)}` : "";
      const script = `display notification ${toAppleScriptStringExpr(payload.body)} with title ${toAppleScriptStringExpr(payload.title)}${sound}`;
      writeDebugLog({ event: "osascript-launch-start", title: payload.title, hasSound: Boolean(payload.sound) });
      const result = spawnSync("osascript", ["-e", script], { stdio: "ignore" });
      writeDebugLog({
        event: "osascript-launch-end",
        status: result.status ?? null,
        error: result.error ? String(result.error) : null,
      });
    }
  } catch (error) {
    writeDebugLog({ event: "macos-send-error", error: error instanceof Error ? error.message : String(error) });
    // swallow errors — notifications are best-effort
  }
}
