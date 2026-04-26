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

  // Poller: check every second, restore name when any attached client's current pane
  // belongs to the badged tab (5-min timeout).
  const script = `
set -eu
run_zellij() {
  if [ -n "$SESSION_NAME" ]; then
    env -u ZELLIJ -u ZELLIJ_PANE_ID -u ZELLIJ_SESSION_NAME zellij --session "$SESSION_NAME" action "$@"
  else
    env -u ZELLIJ -u ZELLIJ_PANE_ID -u ZELLIJ_SESSION_NAME zellij action "$@"
  fi
}
MAX=300
tries=0
while [ "$tries" -lt "$MAX" ]; do
  tries=$((tries + 1))
  clients="$(run_zellij list-clients 2>/dev/null || true)"
  panes="$(run_zellij list-panes --json 2>/dev/null || true)"
  if [ -n "$clients" ] && [ -n "$panes" ]; then
    pane_ids="$(printf '%s\n' "$clients" | awk 'NR > 1 { print $2 }' | sed -E 's/^(terminal_|plugin_)//')"
    viewed_tab="false"
    for pane_id in $pane_ids; do
      client_tab_id="$(printf '%s' "$panes" | jq -r --argjson paneId "$pane_id" '.[] | select(.id == $paneId) | .tab_id' 2>/dev/null || true)"
      if [ "$client_tab_id" = "$TAB_ID" ]; then
        viewed_tab="true"
        break
      fi
    done
    current_name="$(printf '%s' "$panes" | jq -r --argjson tabId "$TAB_ID" '.[] | select(.tab_id == $tabId) | .tab_name' 2>/dev/null | head -n 1 || true)"
    if [ "$viewed_tab" = "true" ]; then
      case "$current_name" in
        " ● "*) restored_name=\${current_name#" ● "} ;;
        *) restored_name="$current_name" ;;
      esac
      if [ -n "$current_name" ] && [ "$restored_name" != "$current_name" ]; then
        run_zellij rename-tab -t "$TAB_ID" "$restored_name" >/dev/null 2>&1 || true
      fi
      exit 0
    fi
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
      SESSION_NAME: process.env.ZELLIJ_SESSION_NAME ?? "",
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
