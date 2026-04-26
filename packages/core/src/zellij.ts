import { exec, spawn, spawnSync } from "node:child_process"
import { promisify } from "node:util"

const execAsync = promisify(exec)

/**
 * Returns true if the current process is running inside a Zellij session.
 * Detected via the ZELLIJ environment variable set by Zellij itself.
 */
export function isZellijSession(): boolean {
  return process.env.ZELLIJ !== undefined
}

const TAB_NOTIFY_PREFIX = " ● "

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
 * that removes only that prefix once the tab becomes active.
 * No-ops if the tab name already has the prefix.
 */
export function markTabNotified(tabId: number, originalName: string): void {
  try {
    const result = spawnSync("zellij", ["action", "rename-tab", "-t", String(tabId), `${TAB_NOTIFY_PREFIX}${originalName}`], {
      stdio: "ignore",
    })
    if (result.error || result.status !== 0) return
  } catch {
    return
  }

  // Poller: check every second, restore name when tab becomes active (5-min timeout)
  const script = `
set -e
MAX=300
tries=0
while [ "$tries" -lt "$MAX" ]; do
  tries=$((tries + 1))
  tabs="$(zellij action list-tabs --json 2>/dev/null || true)"
  if [ -n "$tabs" ] && printf '%s' "$tabs" | jq -e --argjson tabId "$TAB_ID" '.[] | select(.tab_id == $tabId and .active == true)' >/dev/null 2>&1; then
    current_name="$(printf '%s' "$tabs" | jq -r --argjson tabId "$TAB_ID" '.[] | select(.tab_id == $tabId) | .name' 2>/dev/null || true)"
     restored_name="$(printf '%s' "$current_name" | sed 's/^ ● //')"
    if [ "$restored_name" != "$current_name" ]; then
      zellij action rename-tab -t "$TAB_ID" "$restored_name" >/dev/null 2>&1 || true
    fi
    exit 0
  fi
  sleep 1
done
`
  const child = spawn("sh", ["-c", script], {
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      TAB_ID: String(tabId),
    },
  })
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
