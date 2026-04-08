import { existsSync } from "node:fs"

const SOUND_DIR = "/System/Library/Sounds"

/**
 * Returns the full path to a macOS system sound AIFF file, or null if not found.
 */
function macOSSoundPath(name: string): string | null {
  const p = `${SOUND_DIR}/${name}.aiff`
  return existsSync(p) ? p : null
}

/**
 * Play a sound by name (built-in macOS sound name) or file path.
 * Fire-and-forget — errors are swallowed.
 */
export function playSound(nameOrPath: string): void {
  try {
    if (process.platform === "darwin") {
      // Resolve built-in system sound or treat as path
      const filePath = nameOrPath.includes("/")
        ? nameOrPath
        : (macOSSoundPath(nameOrPath) ?? nameOrPath)
      // detached + stdio ignore so it doesn't block the prompt
      const { spawn } = require("node:child_process") as typeof import("node:child_process")
      const child = spawn("afplay", [filePath], {
        detached: true,
        stdio: "ignore",
      })
      child.unref()
    } else if (process.platform === "linux") {
      const { spawn } = require("node:child_process") as typeof import("node:child_process")
      const child = spawn("paplay", [nameOrPath], {
        detached: true,
        stdio: "ignore",
      })
      child.unref()
    } else if (process.platform === "win32") {
      const { spawnSync } = require("node:child_process") as typeof import("node:child_process")
      const script = `[System.Media.SoundPlayer]::new('${nameOrPath.replace(/'/g, "''")}').PlaySync()`
      const encoded = Buffer.from(script, "utf16le").toString("base64")
      spawnSync("powershell", ["-EncodedCommand", encoded], { stdio: "ignore" })
    }
  } catch {
    // Non-critical — swallow
  }
}

/**
 * Synchronously play a macOS system sound (blocks until done).
 * Used for `sounds --play` CLI command where we want to await completion.
 */
export function playSoundSync(nameOrPath: string): void {
  try {
    if (process.platform === "darwin") {
      const filePath = nameOrPath.includes("/")
        ? nameOrPath
        : (macOSSoundPath(nameOrPath) ?? nameOrPath)
      const { spawnSync } = require("node:child_process") as typeof import("node:child_process")
      spawnSync("afplay", [filePath], { stdio: "ignore" })
    } else if (process.platform === "linux") {
      const { spawnSync } = require("node:child_process") as typeof import("node:child_process")
      spawnSync("paplay", [nameOrPath], { stdio: "ignore" })
    } else if (process.platform === "win32") {
      const { spawnSync } = require("node:child_process") as typeof import("node:child_process")
      const script = `[System.Media.SoundPlayer]::new('${nameOrPath.replace(/'/g, "''")}').PlaySync()`
      const encoded = Buffer.from(script, "utf16le").toString("base64")
      spawnSync("powershell", ["-EncodedCommand", encoded], { stdio: "ignore" })
    }
  } catch {
    // Non-critical — swallow
  }
}
