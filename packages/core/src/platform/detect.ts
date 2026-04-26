import { execSync } from "child_process";
import { existsSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import type { NotifyBackend } from "../types.js";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
export const MACOS_HELPER_BUNDLE_ID = "io.github.piqusy.agentnotify";

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function ancestorDirs(start: string): string[] {
  const dirs: string[] = [];
  let current = resolve(start);

  while (true) {
    dirs.push(current);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return dirs;
}

function trustedCandidateRoots(): string[] {
  return unique([
    ...ancestorDirs(MODULE_DIR),
    ...ancestorDirs(dirname(process.execPath)),
  ]);
}

export function findMacOSHelperApp(): string | null {
  const candidates = unique(trustedCandidateRoots().flatMap((root) => [
    join(root, "packages", "macos-helper", "dist", "AgentNotify.app"),
    join(root, "agent-notify-helper", "AgentNotify.app"),
    join(root, "libexec", "agent-notify-helper", "AgentNotify.app"),
    join(root, "AgentNotify.app"),
  ]));

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function findMacOSHelperBinary(): string | null {
  const app = findMacOSHelperApp();
  if (!app) return null;

  const binary = join(app, "Contents", "MacOS", "AgentNotify");
  return existsSync(binary) ? binary : null;
}

function detectMacOSVersion(): string | null {
  try {
    return execSync("sw_vers -productVersion", { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

export function detectMacOSBackend(override: NotifyBackend | null): Promise<NotifyBackend> {
  if (override !== null) return Promise.resolve(override);

  const helperApp = findMacOSHelperApp();
  if (helperApp) {
    return Promise.resolve("macos-helper");
  }

  const version = detectMacOSVersion();
  if (version) {
    const major = Number.parseInt(version.split(".")[0] ?? "0", 10);
    if (major >= 15) {
      process.stderr.write(
        "[agent-notify] Modern macOS detected. Native helper missing; falling back to osascript.\n"
      );
    }
  }

  return Promise.resolve("osascript");
}
