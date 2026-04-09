import { exec } from "node:child_process"
import { promisify } from "node:util"

const execAsync = promisify(exec)

/**
 * Returns true if the current process is running inside a Zellij session.
 * Detected via the ZELLIJ environment variable set by Zellij itself.
 */
export function isZellijSession(): boolean {
  return process.env.ZELLIJ !== undefined
}

/**
 * Returns true if the current pane's tab is the active (visible) tab in Zellij.
 * Uses ZELLIJ_PANE_ID to identify our pane, then cross-references with list-tabs
 * to check if that tab has active: true.
 *
 * Safe fallback: returns true (suppress notification) on any error or missing env vars.
 */
export async function isPaneTabActive(): Promise<boolean> {
  const paneId = process.env.ZELLIJ_PANE_ID
  if (!paneId) return true

  try {
    const [panesOut, tabsOut] = await Promise.all([
      execAsync("zellij action list-panes --json"),
      execAsync("zellij action list-tabs --json"),
    ])

    const panes: Array<{ id: number; tab_id: number }> = JSON.parse(panesOut.stdout)
    const tabs: Array<{ tab_id: number; active: boolean }> = JSON.parse(tabsOut.stdout)

    const ourPane = panes.find((p) => p.id === Number(paneId))
    if (!ourPane) return true

    const ourTab = tabs.find((t) => t.tab_id === ourPane.tab_id)
    if (!ourTab) return true

    return ourTab.active
  } catch {
    return true
  }
}
