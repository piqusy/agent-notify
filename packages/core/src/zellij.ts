import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { exec, spawn, spawnSync } from "node:child_process"
import { promisify } from "node:util"
import type { Config } from "./types.js"

const execAsync = promisify(exec)
const ZELLIJ_STATE_PREFIX = "agent-notify-zellij-state"
const POLLER_PID_FILE = "poller.pid"

const TAB_NOTIFY_PREFIX = " ● "

export type ZellijNotifyOptions = {
  sessionName?: string | null
  originPaneId?: number | null
  tabIndicator?: Config["zellij"]["tabIndicator"]
  paneIndicator?: Config["zellij"]["paneIndicator"]
}

type PendingPaneState = {
  paneId: number
  notifiedAt: number
  paneIndicatorApplied: boolean
}

function sanitizeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-")
}

function sessionStateDir(sessionName: string | null | undefined): string {
  return join(tmpdir(), `${ZELLIJ_STATE_PREFIX}-${sanitizeName(sessionName || "default")}`)
}

function tabStateDir(sessionName: string | null | undefined, tabId: number): string {
  return join(sessionStateDir(sessionName), `tab-${tabId}`)
}

function pendingPaneFile(sessionName: string | null | undefined, tabId: number, paneId: number): string {
  return join(tabStateDir(sessionName, tabId), `pane-${paneId}.json`)
}

function pollerPidFile(sessionName: string | null | undefined): string {
  return join(sessionStateDir(sessionName), POLLER_PID_FILE)
}

function currentTabPrefix(tabIndicator: Config["zellij"]["tabIndicator"] | undefined): string {
  return tabIndicator?.prefix ?? TAB_NOTIFY_PREFIX
}

function stripTabPrefix(tabName: string, prefix: string): string {
  if (tabName.startsWith(prefix)) {
    return tabName.slice(prefix.length)
  }

  return tabName.replace(/^\s*●\s*/, "")
}

function scrubbedZellijEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env = { ...process.env, ...extra }
  delete env.ZELLIJ
  delete env.ZELLIJ_PANE_ID
  delete env.ZELLIJ_SESSION_NAME
  return env
}

function runZellijAction(args: string[], options: { sessionName?: string | null } = {}): void {
  const commandArgs = [
    ...(options.sessionName ? ["--session", options.sessionName] : []),
    "action",
    ...args,
  ]

  spawnSync("zellij", commandArgs, {
    stdio: "ignore",
    env: scrubbedZellijEnv(),
  })
}

function applyPaneIndicator(
  sessionName: string | null,
  paneId: number,
  paneIndicator: Config["zellij"]["paneIndicator"] | undefined,
): boolean {
  if (!paneIndicator?.enabled) return false
  if (!paneIndicator.fg && !paneIndicator.bg) return false

  const args = ["set-pane-color", "--pane-id", String(paneId)]

  if (paneIndicator.fg) args.push("--fg", paneIndicator.fg)
  if (paneIndicator.bg) args.push("--bg", paneIndicator.bg)

  try {
    const result = spawnSync("zellij", [
      ...(sessionName ? ["--session", sessionName] : []),
      "action",
      ...args,
    ], {
      stdio: "ignore",
      env: scrubbedZellijEnv(),
    })

    return !result.error && result.status === 0
  } catch {
    return false
  }
}

function writePendingPaneState(
  sessionName: string | null,
  tabId: number,
  paneId: number,
  state: PendingPaneState,
): void {
  const dir = tabStateDir(sessionName, tabId)
  mkdirSync(dir, { recursive: true })
  writeFileSync(pendingPaneFile(sessionName, tabId, paneId), `${JSON.stringify(state)}\n`, "utf8")
}

function readPollerPid(sessionName: string | null): number | null {
  const file = pollerPidFile(sessionName)
  if (!existsSync(file)) return null

  try {
    const raw = readFileSync(file, "utf8").trim()
    const pid = Number.parseInt(raw, 10)
    return Number.isNaN(pid) ? null : pid
  } catch {
    return null
  }
}

function isPidRunning(pid: number | null): boolean {
  if (!pid) return false

  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function ensureSessionPoller(sessionName: string | null, tabPrefix: string): void {
  const pid = readPollerPid(sessionName)
  if (isPidRunning(pid)) return

  const dir = sessionStateDir(sessionName)
  mkdirSync(dir, { recursive: true })

  const script = `
set -eu
run_zellij() {
  if [ -n "$SESSION_NAME" ]; then
    env -u ZELLIJ -u ZELLIJ_PANE_ID -u ZELLIJ_SESSION_NAME zellij --session "$SESSION_NAME" action "$@"
  else
    env -u ZELLIJ -u ZELLIJ_PANE_ID -u ZELLIJ_SESSION_NAME zellij action "$@"
  fi
}
strip_prefix() {
  name="$1"
  stripped="\${name#"$TAB_PREFIX"}"
  if [ "$stripped" != "$name" ]; then
    printf '%s' "$stripped"
  else
    printf '%s' "$name"
  fi
}
cleanup() {
  rm -f "$PID_FILE"
  rmdir "$STATE_DIR" 2>/dev/null || true
}
trap cleanup EXIT INT TERM
MAX=300
tries=0
while [ "$tries" -lt "$MAX" ]; do
  tries=$((tries + 1))
  tabs_json="$(run_zellij list-tabs --json 2>/dev/null || true)"
  panes_json="$(run_zellij list-panes --json 2>/dev/null || true)"
  clients="$(run_zellij list-clients 2>/dev/null || true)"
  client_pane_ids="$(printf '%s\n' "$clients" | awk 'NR > 1 { print $2 }' | sed -E 's/^(terminal_|plugin_)//')"
  pending_any=false
  for tab_dir in "$STATE_DIR"/tab-*; do
    [ -d "$tab_dir" ] || continue
    tab_name="$(basename "$tab_dir")"
    tab_id="\${tab_name#tab-}"
    for pane_file in "$tab_dir"/pane-*.json; do
      [ -f "$pane_file" ] || continue
      pane_name="$(basename "$pane_file")"
      pane_id="\${pane_name#pane-}"
      pane_id="\${pane_id%.json}"
      pane_exists="$(printf '%s' "$panes_json" | jq -r --argjson paneId "$pane_id" 'any(.[]; .id == $paneId)' 2>/dev/null || echo false)"
      if [ "$pane_exists" != "true" ]; then
        rm -f "$pane_file"
        continue
      fi
      focused=false
      for client_pane_id in $client_pane_ids; do
        if [ "$client_pane_id" = "$pane_id" ]; then
          focused=true
          break
        fi
      done
      if [ "$focused" = true ]; then
        applied="$(jq -r '.paneIndicatorApplied // false' "$pane_file" 2>/dev/null || echo false)"
        if [ "$applied" = "true" ]; then
          run_zellij set-pane-color --pane-id "$pane_id" --reset >/dev/null 2>&1 || true
        fi
        rm -f "$pane_file"
      fi
    done
    remaining=false
    for pane_file in "$tab_dir"/pane-*.json; do
      [ -f "$pane_file" ] || continue
      remaining=true
      break
    done
    current_tab_name="$(printf '%s' "$tabs_json" | jq -r --argjson tabId "$tab_id" '.[] | select(.tab_id == $tabId) | .name' 2>/dev/null | head -n 1 || true)"
    if [ "$remaining" = true ]; then
      pending_any=true
      if [ -n "$current_tab_name" ]; then
        case "$current_tab_name" in
          "$TAB_PREFIX"*) ;;
          *) run_zellij rename-tab -t "$tab_id" "$TAB_PREFIX$current_tab_name" >/dev/null 2>&1 || true ;;
        esac
      fi
    else
      if [ -n "$current_tab_name" ]; then
        stripped_name="$(strip_prefix "$current_tab_name")"
        if [ "$stripped_name" != "$current_tab_name" ]; then
          run_zellij rename-tab -t "$tab_id" "$stripped_name" >/dev/null 2>&1 || true
        fi
      fi
      rmdir "$tab_dir" 2>/dev/null || true
    fi
  done
  if [ "$pending_any" = false ]; then
    rmdir "$STATE_DIR" 2>/dev/null || true
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
      STATE_DIR: dir,
      PID_FILE: pollerPidFile(sessionName),
      SESSION_NAME: sessionName ?? "",
      TAB_PREFIX: tabPrefix,
    },
  })

  writeFileSync(pollerPidFile(sessionName), String(child.pid ?? ""), "utf8")
  child.unref()
}

/**
 * Returns true if the current process is running inside a Zellij session.
 * Detected via the ZELLIJ environment variable set by Zellij itself.
 */
export function isZellijSession(): boolean {
  return process.env.ZELLIJ !== undefined
}

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
 * Adds a ● prefix to the given tab's name, records the originating pane as pending,
 * optionally applies a pane indicator, and ensures the session poller is running.
 * No-ops if the rename action fails.
 */
export function markTabNotified(tabId: number, originalName: string, options: ZellijNotifyOptions = {}): void {
  const sessionName = options.sessionName ?? process.env.ZELLIJ_SESSION_NAME ?? ""
  const originPaneId = options.originPaneId ?? Number.parseInt(process.env.ZELLIJ_PANE_ID ?? "", 10)
  const paneId = Number.isNaN(originPaneId) ? null : originPaneId
  const tabPrefix = currentTabPrefix(options.tabIndicator)
  const paneIndicator = options.paneIndicator
  const effectiveTabIndicatorEnabled = (options.tabIndicator?.enabled ?? true) || Boolean(paneIndicator?.enabled)

  if (!effectiveTabIndicatorEnabled) return

  try {
    if (effectiveTabIndicatorEnabled && !originalName.startsWith(tabPrefix)) {
      const result = spawnSync("zellij", ["action", "rename-tab", "-t", String(tabId), `${tabPrefix}${originalName}`], {
        stdio: "ignore",
      })
      if (result.error || result.status !== 0) return
    }
  } catch {
    return
  }

  if (paneId === null) return

  const paneIndicatorApplied = applyPaneIndicator(sessionName, paneId, paneIndicator)

  writePendingPaneState(sessionName, tabId, paneId, {
    paneId,
    notifiedAt: Math.floor(Date.now() / 1000),
    paneIndicatorApplied,
  })

  ensureSessionPoller(sessionName, tabPrefix)
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
