import { readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"

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
export async function checkAndUpdateCooldown(
  file: string,
  seconds: number,
): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000)
  try {
    const raw = await readFile(file, "utf8")
    const last = parseInt(raw.trim(), 10)
    if (!isNaN(last) && now - last < seconds) {
      return false
    }
  } catch {
    // ENOENT or other error → proceed (safe default)
  }
  try {
    await writeFile(file, String(now), "utf8")
  } catch {
    // best-effort write
  }
  return true
}
