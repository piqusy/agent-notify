import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { exec, spawn, spawnSync } from "node:child_process"
import { promisify } from "node:util"
import type { Config } from "./types.js"

const execAsync = promisify(exec)
const ZELLIJ_STATE_PREFIX = "agent-notify-zellij-state"
const POLLER_PID_FILE = "poller.pid"

const TAB_NOTIFY_PREFIX = " ● "
const TAB_WORKING_PREFIX = " ⠋ "

export type ZellijNotifyOptions = {
  sessionName?: string | null
  originPaneId?: number | null
  tabIndicator?: Config["zellij"]["tabIndicator"]
  paneIndicator?: Config["zellij"]["paneIndicator"]
  workingPrefix?: string
}

type PendingPaneState = {
  paneId: number
  updatedAt: number
  attentionAt: number | null
  workingAt: number | null
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

function currentWorkingPrefix(workingPrefix: string | undefined): string {
  return workingPrefix ?? TAB_WORKING_PREFIX
}

function stripKnownTabPrefixes(tabName: string, prefixes: string[]): string {
  for (const prefix of prefixes) {
    if (tabName.startsWith(prefix)) {
      return tabName.slice(prefix.length)
    }
  }

  return tabName.replace(/^\s*[●◐]\s*/, "")
}

function scrubbedZellijEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env = { ...process.env, ...extra }
  delete env.ZELLIJ
  delete env.ZELLIJ_PANE_ID
  delete env.ZELLIJ_SESSION_NAME
  return env
}

function applyPaneIndicator(
  sessionName: string | null,
  paneId: number,
  paneIndicator: Config["zellij"]["paneIndicator"] | undefined,
): boolean {
  if (!paneIndicator?.enabled) return false
  if (!paneIndicator.bg) return false

  const args = ["set-pane-color", "--pane-id", String(paneId), "--bg", paneIndicator.bg]

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

function clearPaneIndicator(sessionName: string | null, paneId: number): void {
  try {
    spawnSync("zellij", [
      ...(sessionName ? ["--session", sessionName] : []),
      "action",
      "set-pane-color",
      "--pane-id",
      String(paneId),
      "--reset",
    ], {
      stdio: "ignore",
      env: scrubbedZellijEnv(),
    })
  } catch {
    // best effort only
  }
}

function readPendingPaneState(
  sessionName: string | null,
  tabId: number,
  paneId: number,
): PendingPaneState | null {
  const file = pendingPaneFile(sessionName, tabId, paneId)
  if (!existsSync(file)) return null

  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<PendingPaneState>
    return {
      paneId,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
      attentionAt: typeof parsed.attentionAt === "number" ? parsed.attentionAt : null,
      workingAt: typeof parsed.workingAt === "number" ? parsed.workingAt : null,
      paneIndicatorApplied: Boolean(parsed.paneIndicatorApplied),
    }
  } catch {
    return null
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

function removePendingPaneState(sessionName: string | null, tabId: number, paneId: number): void {
  rmSync(pendingPaneFile(sessionName, tabId, paneId), { force: true })
  rmdirIfEmpty(tabStateDir(sessionName, tabId))
}

function rmdirIfEmpty(dir: string): void {
  try {
    rmSync(dir, { recursive: false })
  } catch {
    // ignore non-empty or missing dirs
  }
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

function ensureSessionPoller(sessionName: string | null, attentionPrefix: string, workingPrefix: string): void {
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
  case "$name" in
    "$ATTENTION_PREFIX"*) printf '%s' "\${name#"$ATTENTION_PREFIX"}" ;;
    "$WORKING_PREFIX"*) printf '%s' "\${name#"$WORKING_PREFIX"}" ;;
    *) printf '%s' "$name" | sed -E 's/^[[:space:]]*[●◐][[:space:]]*//' ;;
  esac
}
rename_tab_for_state() {
  tab_id="$1"
  current_name="$2"
  desired_state="$3"
  stripped_name="$(strip_prefix "$current_name")"
  case "$desired_state" in
    attention) desired_name="$ATTENTION_PREFIX$stripped_name" ;;
    working) desired_name="$WORKING_PREFIX$stripped_name" ;;
    none) desired_name="$stripped_name" ;;
    *) desired_name="$current_name" ;;
  esac

  if [ "$desired_name" != "$current_name" ]; then
    run_zellij rename-tab -t "$tab_id" "$desired_name" >/dev/null 2>&1 || true
  fi
}
cleanup() {
  rm -f "$PID_FILE"
  rmdir "$STATE_DIR" 2>/dev/null || true
}
trap cleanup EXIT INT TERM
while :; do
  tabs_json="$(run_zellij list-tabs --json 2>/dev/null || true)"
  panes_json="$(run_zellij list-panes --json 2>/dev/null || true)"
  clients="$(run_zellij list-clients 2>/dev/null || true)"
  client_pane_ids="$(printf '%s\n' "$clients" | awk 'NR > 1 { print $2 }' | sed -E 's/^(terminal_|plugin_)//')"
  pending_any=false
  for tab_dir in "$STATE_DIR"/tab-*; do
    [ -d "$tab_dir" ] || continue
    tab_name="$(basename "$tab_dir")"
    tab_id="\${tab_name#tab-}"
    has_attention=false
    has_working=false
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

      attention_at="$(jq -r '.attentionAt // empty' "$pane_file" 2>/dev/null || true)"
      working_at="$(jq -r '.workingAt // empty' "$pane_file" 2>/dev/null || true)"

      if [ "$focused" = true ] && [ -n "$attention_at" ]; then
        applied="$(jq -r '.paneIndicatorApplied // false' "$pane_file" 2>/dev/null || echo false)"
        if [ "$applied" = "true" ]; then
          run_zellij set-pane-color --pane-id "$pane_id" --reset >/dev/null 2>&1 || true
        fi
        tmp_file="$pane_file.tmp"
        jq '.attentionAt = null | .paneIndicatorApplied = false | .updatedAt = (now | floor)' "$pane_file" > "$tmp_file" 2>/dev/null && mv "$tmp_file" "$pane_file"
        attention_at=""
        working_at="$(jq -r '.workingAt // empty' "$pane_file" 2>/dev/null || true)"
      fi

      if [ -z "$attention_at" ] && [ -z "$working_at" ]; then
        rm -f "$pane_file"
        continue
      fi

      if [ -n "$attention_at" ]; then
        has_attention=true
      elif [ -n "$working_at" ]; then
        has_working=true
      fi
    done

    remaining=false
    for pane_file in "$tab_dir"/pane-*.json; do
      [ -f "$pane_file" ] || continue
      remaining=true
      break
    done

    current_tab_name="$(printf '%s' "$tabs_json" | jq -r --argjson tabId "$tab_id" '.[] | select(.tab_id == $tabId) | .name' 2>/dev/null | head -n 1 || true)"

    desired_state=none
    if [ "$has_attention" = true ]; then
      desired_state=attention
    elif [ "$has_working" = true ]; then
      desired_state=working
    fi

    if [ "$remaining" = true ]; then
      pending_any=true
    fi

    if [ -n "$current_tab_name" ]; then
      rename_tab_for_state "$tab_id" "$current_tab_name" "$desired_state"
    fi

    if [ "$remaining" = false ]; then
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
      ATTENTION_PREFIX: attentionPrefix,
      WORKING_PREFIX: workingPrefix,
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
 * Adds an attention prefix to the given tab's name, records the originating pane as needing
 * attention, optionally applies a pane indicator, and ensures the session poller is running.
 */
export function markTabNotified(tabId: number, originalName: string, options: ZellijNotifyOptions = {}): void {
  const sessionName = options.sessionName ?? process.env.ZELLIJ_SESSION_NAME ?? ""
  const originPaneId = options.originPaneId ?? Number.parseInt(process.env.ZELLIJ_PANE_ID ?? "", 10)
  const paneId = Number.isNaN(originPaneId) ? null : originPaneId
  const tabPrefix = currentTabPrefix(options.tabIndicator)
  const workingPrefix = currentWorkingPrefix(options.workingPrefix)
  const paneIndicator = options.paneIndicator
  const effectiveTabIndicatorEnabled = (options.tabIndicator?.enabled ?? true) || Boolean(paneIndicator?.enabled)

  if (!effectiveTabIndicatorEnabled || paneId === null) return

  const strippedName = stripKnownTabPrefixes(originalName, [tabPrefix, workingPrefix])

  try {
    const result = spawnSync("zellij", ["action", "rename-tab", "-t", String(tabId), `${tabPrefix}${strippedName}`], {
      stdio: "ignore",
    })
    if (result.error || result.status !== 0) return
  } catch {
    return
  }

  const paneIndicatorApplied = applyPaneIndicator(sessionName, paneId, paneIndicator)

  writePendingPaneState(sessionName, tabId, paneId, {
    paneId,
    updatedAt: Math.floor(Date.now() / 1000),
    attentionAt: Math.floor(Date.now() / 1000),
    workingAt: null,
    paneIndicatorApplied,
  })

  ensureSessionPoller(sessionName, tabPrefix, workingPrefix)
}

/**
 * Marks the current pane as actively working. This updates per-pane state and lets the
 * session poller derive a tab-level working prefix as long as no pane in the tab needs attention.
 */
export function markPaneWorking(tabId: number, originalName: string, options: ZellijNotifyOptions = {}): void {
  const sessionName = options.sessionName ?? process.env.ZELLIJ_SESSION_NAME ?? ""
  const originPaneId = options.originPaneId ?? Number.parseInt(process.env.ZELLIJ_PANE_ID ?? "", 10)
  const paneId = Number.isNaN(originPaneId) ? null : originPaneId
  const tabPrefix = currentTabPrefix(options.tabIndicator)
  const workingPrefix = currentWorkingPrefix(options.workingPrefix)

  if (paneId === null) return

  const existing = readPendingPaneState(sessionName, tabId, paneId)
  if (existing?.paneIndicatorApplied) {
    clearPaneIndicator(sessionName, paneId)
  }

  writePendingPaneState(sessionName, tabId, paneId, {
    paneId,
    updatedAt: Math.floor(Date.now() / 1000),
    attentionAt: null,
    workingAt: Math.floor(Date.now() / 1000),
    paneIndicatorApplied: false,
  })

  // Preserve the current visible name. The poller will derive the correct tab-level state,
  // including attention > working precedence across multiple panes.
  void originalName
  ensureSessionPoller(sessionName, tabPrefix, workingPrefix)
}

/**
 * Clears the working state for the current pane. Attention state, if any, is preserved.
 */
export function clearPaneWorking(tabId: number, options: ZellijNotifyOptions = {}): void {
  const sessionName = options.sessionName ?? process.env.ZELLIJ_SESSION_NAME ?? ""
  const originPaneId = options.originPaneId ?? Number.parseInt(process.env.ZELLIJ_PANE_ID ?? "", 10)
  const paneId = Number.isNaN(originPaneId) ? null : originPaneId
  const tabPrefix = currentTabPrefix(options.tabIndicator)
  const workingPrefix = currentWorkingPrefix(options.workingPrefix)

  if (paneId === null) return

  const existing = readPendingPaneState(sessionName, tabId, paneId)
  if (!existing) return

  const nextState: PendingPaneState = {
    ...existing,
    updatedAt: Math.floor(Date.now() / 1000),
    workingAt: null,
  }

  if (nextState.attentionAt === null && !nextState.paneIndicatorApplied) {
    removePendingPaneState(sessionName, tabId, paneId)
  } else {
    writePendingPaneState(sessionName, tabId, paneId, nextState)
  }

  ensureSessionPoller(sessionName, tabPrefix, workingPrefix)
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
