import { exec } from "node:child_process"
import { promisify } from "node:util"

const execAsync = promisify(exec)

export const TERM_PROGRAM_MAP: Record<string, string> = {
  ghostty:       "Ghostty",
  "iTerm.app":   "iTerm2",
  Apple_Terminal: "Terminal",
  WarpTerminal:  "Warp",
  alacritty:     "Alacritty",
  kitty:         "kitty",
  hyper:         "Hyper",
}

/**
 * Resolve the display name of the user's terminal app.
 * Priority: AGENT_NOTIFY_TERMINAL env var → TERM_PROGRAM_MAP[termProgram] → null (skip focus check)
 */
export function resolveTerminalApp(termProgram: string): string | null {
  if (process.env.AGENT_NOTIFY_TERMINAL) {
    return process.env.AGENT_NOTIFY_TERMINAL
  }
  return TERM_PROGRAM_MAP[termProgram] ?? null
}

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
