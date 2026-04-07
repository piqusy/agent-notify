import { execSync } from "child_process";
import { existsSync } from "fs";
import type { NotifyBackend } from "../types.js";

const TERMINAL_NOTIFIER_PATHS = [
  "/opt/homebrew/bin/terminal-notifier",
  "/usr/local/bin/terminal-notifier",
];

export function detectMacOSBackend(override: NotifyBackend | null): Promise<NotifyBackend> {
  // If user set an explicit override, use it
  if (override !== null) return Promise.resolve(override);

  // Check if running on macOS 15.x (Sequoia) — warn to stderr
  try {
    const version = execSync("sw_vers -productVersion", { encoding: "utf8" }).trim();
    if (version.startsWith("15.")) {
      process.stderr.write(
        "[agent-notify] macOS Sequoia (15.x) detected. Some notification methods may be restricted.\n"
      );
    }
  } catch {
    // ignore
  }

  // Check for terminal-notifier in Homebrew paths
  for (const p of TERMINAL_NOTIFIER_PATHS) {
    if (existsSync(p)) {
      return Promise.resolve("terminal-notifier");
    }
  }

  return Promise.resolve("osascript");
}
