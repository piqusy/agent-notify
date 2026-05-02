import { readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"

export interface CooldownState {
  active: boolean
  remainingSeconds: number
}

/**
 * Returns the path of the per-tool cooldown file.
 * Tool name is sanitized to alphanumeric/hyphen/underscore to prevent path traversal.
 */
export function cooldownFilePath(tool: string): string {
  const safeTool = tool.replace(/[^a-zA-Z0-9_-]/g, "-")
  return `${tmpdir()}/agent-notify-cooldown-${safeTool}`
}

/**
 * Check per-tool cooldown and update if proceeding.
 * Returns true (proceed) if cooldown has expired or file doesn't exist.
 * Returns false (skip) if within cooldown window.
 * Writes current epoch to file on proceed.
 * Race condition: writes are best-effort; no locking in v1.
 */
export async function getCooldownState(file: string, seconds: number): Promise<CooldownState> {
  const now = Math.floor(Date.now() / 1000)

  try {
    const raw = await readFile(file, "utf8")
    const last = parseInt(raw.trim(), 10)

    if (!Number.isNaN(last) && now - last < seconds) {
      return {
        active: true,
        remainingSeconds: Math.max(0, seconds - (now - last)),
      }
    }
  } catch {
    // ENOENT or other error → no active cooldown
  }

  return { active: false, remainingSeconds: 0 }
}

export async function checkAndUpdateCooldown(
  file: string,
  seconds: number,
): Promise<boolean> {
  const cooldown = await getCooldownState(file, seconds)
  if (cooldown.active) {
    return false
  }

  try {
    await writeFile(file, String(Math.floor(Date.now() / 1000)), "utf8")
  } catch {
    // best-effort write
  }
  return true
}
