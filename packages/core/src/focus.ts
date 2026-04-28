import { exec } from "node:child_process"
import { promisify } from "node:util"

export {
  KNOWN_TERMINAL_APPS,
  TERMINAL_REGISTRY,
  TERM_PROGRAM_MAP,
  findTerminalDescriptorByAppName,
  resolveTerminal,
  resolveTerminalApp,
} from "./terminal.js"

const execAsync = promisify(exec)

/**
 * Returns true if the given terminal app is currently frontmost on macOS.
 * Returns false on non-macOS or on any error (safe default = notify).
 *
 * Bug fix: compare osascript output in lowercase to avoid case mismatch
 * (e.g. "Ghostty" returned by TERM_PROGRAM_MAP vs "ghostty" returned by osascript).
 */
export async function isTerminalFocused(terminalApp: string): Promise<boolean> {
  if (process.platform !== "darwin") return false
  try {
    const { stdout } = await execAsync(
      `osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true'`,
    )
    return stdout.trim().toLowerCase() === terminalApp.toLowerCase()
  } catch {
    return false
  }
}
