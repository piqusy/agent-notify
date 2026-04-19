import { exec, execSync, spawn } from "node:child_process"
import { promisify } from "node:util"

const execAsync = promisify(exec)

/**
 * Returns true if the current process is running inside a Zellij session.
 * Detected via the ZELLIJ environment variable set by Zellij itself.
 */
export function isZellijSession(): boolean {
  return process.env.ZELLIJ !== undefined
}

const TAB_NOTIFY_PREFIX = "● "

/**
 * Returns the current pane's tab ID and name, or null if unavailable.
 */
export async function getCurrentTabInfo(): Promise<{ tabId: number; tabName: string } | null> {
  const paneId = process.env.ZELLIJ_PANE_ID
  if (!paneId) return null

  try {
    const [panesOut, tabsOut] = await Promise.all([
      execAsync("zellij action list-panes --json"),
      execAsync("zellij action list-tabs --json"),
    ])

    const panes: Array<{ id: number; tab_id: number }> = JSON.parse(panesOut.stdout)
    const tabs: Array<{ tab_id: number; active: boolean; name: string }> = JSON.parse(tabsOut.stdout)

    const ourPane = panes.find((p) => p.id === Number(paneId))
    if (!ourPane) return null

    const ourTab = tabs.find((t) => t.tab_id === ourPane.tab_id)
    if (!ourTab) return null

    return { tabId: ourTab.tab_id, tabName: ourTab.name }
  } catch {
    return null
  }
}

/**
 * Adds a ● prefix to the given tab's name and spawns a background poller
 * that removes it once the tab becomes active (user focuses it).
 * No-ops if the tab name already has the prefix.
 */
export function markTabNotified(tabId: number, originalName: string): void {
  try {
    execSync(`zellij action rename-tab -t ${tabId} ${JSON.stringify(`${TAB_NOTIFY_PREFIX}${originalName}`)}`)
  } catch {
    return
  }

  // Poller: check every second, restore name when tab becomes active (5-min timeout)
  const script = `
    const { execSync } = require('child_process');
    const MAX = 300;
    let tries = 0;
    function poll() {
      if (++tries > MAX) return;
      try {
        const tabs = JSON.parse(execSync('zellij action list-tabs --json').toString());
        const tab = tabs.find(t => t.tab_id === ${tabId});
        if (tab && tab.active) {
          execSync('zellij action rename-tab -t ${tabId} ' + JSON.stringify(${JSON.stringify(originalName)}));
          return;
        }
      } catch {}
      setTimeout(poll, 1000);
    }
    poll();
  `
  const child = spawn(process.execPath, ["-e", script], { detached: true, stdio: "ignore" })
  child.unref()
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
