import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { delimiter, join } from "node:path"
import { spawn, spawnSync } from "node:child_process"
import type { Config } from "./types.js"

const ZELLIJ_STATE_PREFIX = "agent-notify-zellij-state"
const POLLER_PID_FILE = "poller.pid"
const POLLER_VERSION_FILE = "poller.version"
const CURRENT_POLLER_VERSION = "2"

const TAB_NOTIFY_PREFIX = " ● "
const TAB_WORKING_PREFIX = " ○ "
const AUTO_TAB_NAME_PATTERN = /^Tab #\d+$/
const GENERIC_TAB_PREFIX_PATTERN = /^\s*(?:[○●◐]\s*)+/

function writeDebugLog(payload: Record<string, unknown>): void {
  const file = process.env.AGENT_NOTIFY_DEBUG_LOG?.trim()
  if (!file) return

  try {
    appendFileSync(file, `${JSON.stringify({
      timestamp: Date.now(),
      pid: process.pid,
      source: "core:zellij",
      ...payload,
    })}\n`, "utf8")
  } catch {
    // debug logging must never affect zellij flow
  }
}

function elapsedMs(startedAt: bigint): number {
  return Number(process.hrtime.bigint() - startedAt) / 1_000_000
}

export type ZellijNotifyOptions = {
  sessionName?: string | null
  originPaneId?: number | null
  tabIndicator?: Config["zellij"]["tabIndicator"]
  paneIndicator?: Config["zellij"]["paneIndicator"]
  workingPrefix?: string
  deferAuxiliaryWork?: boolean
  visibleTabName?: string | null
}

export type CurrentTabInfo = {
  tabId: number
  tabName: string
  visibleTabName: string
}

type PendingPaneState = {
  paneId: number
  updatedAt: number
  attentionAt: number | null
  workingAt: number | null
  paneIndicatorApplied: boolean
  indicatorTabName: string | null
  restoreTabName: string | null
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

function pollerVersionFile(sessionName: string | null | undefined): string {
  return join(sessionStateDir(sessionName), POLLER_VERSION_FILE)
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

  return tabName.replace(/^\s*[●○◐]\s*/, "")
}

function stripGenericTabPrefixes(tabName: string): string {
  return tabName.replace(GENERIC_TAB_PREFIX_PATTERN, "")
}

function isAutoTabName(tabName: string): boolean {
  return AUTO_TAB_NAME_PATTERN.test(stripGenericTabPrefixes(tabName).trim())
}

function resolveVisibleTabName(rawTabName: string, paneTitle: string | null | undefined, prefixes: string[]): string {
  const strippedTabName = stripGenericTabPrefixes(stripKnownTabPrefixes(rawTabName, prefixes)).trim()
  if (!isAutoTabName(strippedTabName)) return strippedTabName

  const strippedPaneTitle = typeof paneTitle === "string"
    ? stripGenericTabPrefixes(stripKnownTabPrefixes(paneTitle, prefixes)).trim()
    : ""

  return strippedPaneTitle || strippedTabName
}

function scrubbedZellijEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env = { ...process.env, ...extra }
  delete env.ZELLIJ
  delete env.ZELLIJ_PANE_ID
  delete env.ZELLIJ_SESSION_NAME
  return env
}

type PaneTabLookup = {
  tabId: number
  tabName: string
  active: boolean
}

type SessionMetadataTab = {
  position: number
  tabId: number
  tabName: string
  active: boolean
}

type SessionMetadataPane = {
  paneId: number
  isPlugin: boolean
  tabPosition: number
}

type RunZellijSyncOptions = {
  sessionName?: string | null
  captureOutput?: boolean
  scrubEnv?: boolean
}

function resolveExecutableOnPath(names: string[]): string | null {
  const pathValue = process.env.PATH ?? ""
  if (!pathValue) return null

  for (const dir of pathValue.split(delimiter)) {
    if (!dir) continue

    for (const name of names) {
      const candidate = join(dir, name)
      if (existsSync(candidate)) {
        return candidate
      }
    }
  }

  return null
}

function resolveZellijExecutable(): string {
  const binaryNames = process.platform === "win32"
    ? ["zellij.exe", "zellij.cmd", "zellij.bat", "zellij"]
    : ["zellij"]

  const resolvedFromPath = resolveExecutableOnPath(binaryNames)
  if (resolvedFromPath) {
    return resolvedFromPath
  }

  const staticCandidates = process.platform === "win32"
    ? []
    : ["/opt/homebrew/bin/zellij", "/usr/local/bin/zellij", "/usr/bin/zellij"]

  for (const candidate of staticCandidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  return binaryNames[0]!
}

function runZellijActionSync(
  args: string[],
  options: RunZellijSyncOptions = {},
) {
  const executable = resolveZellijExecutable()
  const baseArgs = options.sessionName ? ["--session", options.sessionName] : []

  return spawnSync(executable, [...baseArgs, "action", ...args], {
    stdio: options.captureOutput ? ["ignore", "pipe", "pipe"] : "ignore",
    ...(options.captureOutput ? { encoding: "utf8" as const } : {}),
    ...(options.scrubEnv ? { env: scrubbedZellijEnv() } : {}),
  })
}

function zellijCacheRootCandidates(): string[] {
  const candidates: string[] = []
  const pushUnique = (value: string | null | undefined) => {
    const trimmed = value?.trim()
    if (!trimmed || candidates.includes(trimmed)) return
    candidates.push(trimmed)
  }

  const homeDir = homedir()
  const xdgCacheHome = process.env.XDG_CACHE_HOME?.trim()

  if (process.platform === "darwin") {
    pushUnique(join(homeDir, "Library", "Caches", "org.Zellij-Contributors.Zellij"))
    if (xdgCacheHome) {
      pushUnique(join(xdgCacheHome, "org.Zellij-Contributors.Zellij"))
    }
  } else if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA?.trim()
    if (localAppData) {
      pushUnique(join(localAppData, "Zellij"))
      pushUnique(join(localAppData, "Zellij", "cache"))
      pushUnique(join(localAppData, "cache", "Zellij"))
    }
  } else {
    if (xdgCacheHome) {
      pushUnique(join(xdgCacheHome, "org.Zellij-Contributors.Zellij"))
    }
    pushUnique(join(homeDir, ".cache", "org.Zellij-Contributors.Zellij"))
  }

  return candidates
}

function resolveSessionMetadataPath(sessionName: string): string | null {
  for (const cacheRoot of zellijCacheRootCandidates()) {
    if (!existsSync(cacheRoot)) continue

    let contractVersions: Array<{ version: number; path: string }> = []
    try {
      contractVersions = readdirSync(cacheRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && /^contract_version_\d+$/.test(entry.name))
        .map((entry) => ({
          version: Number.parseInt(entry.name.replace("contract_version_", ""), 10),
          path: join(cacheRoot, entry.name),
        }))
        .filter((entry) => Number.isFinite(entry.version))
        .sort((a, b) => b.version - a.version)
    } catch {
      continue
    }

    for (const contractVersion of contractVersions) {
      const metadataPath = join(contractVersion.path, "session_info", sessionName, "session-metadata.kdl")
      if (existsSync(metadataPath)) {
        return metadataPath
      }
    }
  }

  return null
}

function parseKdlScalar(rawValue: string): string | number | boolean | null {
  const value = rawValue.trim()
  if (!value) return null
  if (value === "true") return true
  if (value === "false") return false
  if (/^-?\d+$/.test(value)) {
    return Number.parseInt(value, 10)
  }
  if (value.startsWith("\"") && value.endsWith("\"")) {
    try {
      return JSON.parse(value) as string
    } catch {
      return null
    }
  }
  return null
}

function parsePaneTabInfoFromSessionMetadata(text: string, paneId: number): PaneTabLookup | null {
  const tabsByPosition = new Map<number, SessionMetadataTab>()
  const panes: SessionMetadataPane[] = []
  let currentTab: Partial<SessionMetadataTab> | null = null
  let currentPane: Partial<SessionMetadataPane> | null = null

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue

    if (line === "tab {") {
      currentTab = {}
      continue
    }

    if (line === "pane {") {
      currentPane = {}
      continue
    }

    if (line === "}") {
      if (currentTab) {
        if (
          typeof currentTab.position === "number"
          && typeof currentTab.tabId === "number"
          && typeof currentTab.tabName === "string"
        ) {
          tabsByPosition.set(currentTab.position, {
            position: currentTab.position,
            tabId: currentTab.tabId,
            tabName: currentTab.tabName,
            active: currentTab.active ?? false,
          })
        }
        currentTab = null
        continue
      }

      if (currentPane) {
        if (
          typeof currentPane.paneId === "number"
          && typeof currentPane.isPlugin === "boolean"
          && typeof currentPane.tabPosition === "number"
        ) {
          panes.push({
            paneId: currentPane.paneId,
            isPlugin: currentPane.isPlugin,
            tabPosition: currentPane.tabPosition,
          })
        }
        currentPane = null
        continue
      }

      continue
    }

    const match = line.match(/^([a-zA-Z0-9_]+)\s+(.+)$/)
    if (!match) continue

    const [, key, rawValue] = match
    const value = parseKdlScalar(rawValue)
    if (value === null) continue

    if (currentTab) {
      if (key === "position" && typeof value === "number") currentTab.position = value
      if (key === "tab_id" && typeof value === "number") currentTab.tabId = value
      if (key === "name" && typeof value === "string") currentTab.tabName = value
      if (key === "active" && typeof value === "boolean") currentTab.active = value
      continue
    }

    if (currentPane) {
      if (key === "id" && typeof value === "number") currentPane.paneId = value
      if (key === "is_plugin" && typeof value === "boolean") currentPane.isPlugin = value
      if (key === "tab_position" && typeof value === "number") currentPane.tabPosition = value
    }
  }

  const matchingPanes = panes.filter((pane) => pane.paneId === paneId)
  const targetPane = matchingPanes.find((pane) => pane.isPlugin === false) ?? matchingPanes[0]
  if (!targetPane) return null

  const tab = tabsByPosition.get(targetPane.tabPosition)
  if (!tab) return null

  return {
    tabId: tab.tabId,
    tabName: tab.tabName,
    active: tab.active,
  }
}

function lookupPaneTabInfoFromSessionMetadata(sessionName: string | null, paneId: number): PaneTabLookup | null {
  if (!sessionName) return null

  const startedAt = process.hrtime.bigint()
  writeDebugLog({ event: "session-metadata-lookup-start", sessionName, paneId })

  try {
    const saveStartedAt = process.hrtime.bigint()
    const saveResult = runZellijActionSync(["save-session"], {
      sessionName,
      scrubEnv: true,
    })
    writeDebugLog({
      event: "session-metadata-save-end",
      elapsedMs: elapsedMs(saveStartedAt),
      sessionName,
      status: saveResult.status ?? null,
      error: saveResult.error ? String(saveResult.error) : null,
    })
    if (saveResult.error || saveResult.status !== 0) return null

    const metadataPath = resolveSessionMetadataPath(sessionName)
    writeDebugLog({ event: "session-metadata-path", sessionName, path: metadataPath ?? null })
    if (!metadataPath) return null

    const readStartedAt = process.hrtime.bigint()
    const metadata = readFileSync(metadataPath, "utf8")
    const lookup = parsePaneTabInfoFromSessionMetadata(metadata, paneId)
    writeDebugLog({
      event: "session-metadata-read-end",
      elapsedMs: elapsedMs(readStartedAt),
      sessionName,
      paneId,
      bytes: metadata.length,
      matched: Boolean(lookup),
    })
    if (!lookup) return null

    writeDebugLog({
      event: "session-metadata-lookup-end",
      elapsedMs: elapsedMs(startedAt),
      sessionName,
      paneId,
      tabId: lookup.tabId,
      tabName: lookup.tabName,
      active: lookup.active,
    })
    return lookup
  } catch (error) {
    writeDebugLog({
      event: "session-metadata-lookup-error",
      elapsedMs: elapsedMs(startedAt),
      sessionName,
      paneId,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

function applyPaneIndicator(
  sessionName: string | null,
  paneId: number,
  paneIndicator: Config["zellij"]["paneIndicator"] | undefined,
): boolean {
  if (!paneIndicator?.enabled) return false
  if (!paneIndicator.bg) return false

  const startedAt = process.hrtime.bigint()
  const args = ["set-pane-color", "--pane-id", String(paneId), "--bg", paneIndicator.bg]

  writeDebugLog({ event: "pane-indicator-start", paneId, sessionName, bg: paneIndicator.bg })

  try {
    const result = runZellijActionSync(args, {
      sessionName,
      scrubEnv: true,
    })

    writeDebugLog({
      event: "pane-indicator-end",
      elapsedMs: elapsedMs(startedAt),
      paneId,
      status: result.status ?? null,
      error: result.error ? String(result.error) : null,
    })

    return !result.error && result.status === 0
  } catch (error) {
    writeDebugLog({
      event: "pane-indicator-error",
      elapsedMs: elapsedMs(startedAt),
      paneId,
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}

function clearPaneIndicator(sessionName: string | null, paneId: number): void {
  try {
    runZellijActionSync(["set-pane-color", "--pane-id", String(paneId), "--reset"], {
      sessionName,
      scrubEnv: true,
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
      indicatorTabName: typeof parsed.indicatorTabName === "string" ? parsed.indicatorTabName : null,
      restoreTabName: typeof parsed.restoreTabName === "string" ? parsed.restoreTabName : null,
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

function readPollerVersion(sessionName: string | null): string | null {
  const file = pollerVersionFile(sessionName)
  if (!existsSync(file)) return null

  try {
    return readFileSync(file, "utf8").trim() || null
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

function stopPoller(pid: number): void {
  if (!isPidRunning(pid)) return

  try {
    process.kill(pid, "SIGTERM")
  } catch {
    // best effort only
  }
}

function ensureSessionPoller(sessionName: string | null, attentionPrefix: string, workingPrefix: string): void {
  const startedAt = process.hrtime.bigint()
  const pid = readPollerPid(sessionName)
  const pollerVersion = readPollerVersion(sessionName)
  if (isPidRunning(pid) && pollerVersion === CURRENT_POLLER_VERSION) {
    writeDebugLog({ event: "poller-skip-existing", elapsedMs: elapsedMs(startedAt), sessionName, pid, pollerVersion })
    return
  }
  if (pid !== null && isPidRunning(pid)) stopPoller(pid)

  const executable = resolveZellijExecutable()
  const dir = sessionStateDir(sessionName)
  writeDebugLog({ event: "poller-start", sessionName, stateDir: dir, executable })
  mkdirSync(dir, { recursive: true })

  const script = `
set -eu
run_zellij() {
  if [ -n "$SESSION_NAME" ]; then
    env -u ZELLIJ -u ZELLIJ_PANE_ID -u ZELLIJ_SESSION_NAME "$ZELLIJ_EXECUTABLE" --session "$SESSION_NAME" action "$@"
  else
    env -u ZELLIJ -u ZELLIJ_PANE_ID -u ZELLIJ_SESSION_NAME "$ZELLIJ_EXECUTABLE" action "$@"
  fi
}
strip_prefix() {
  name="$1"
  case "$name" in
    "$ATTENTION_PREFIX"*) printf '%s' "\${name#"$ATTENTION_PREFIX"}" ;;
    "$WORKING_PREFIX"*) printf '%s' "\${name#"$WORKING_PREFIX"}" ;;
    *) printf '%s' "$name" | sed -E 's/^[[:space:]]*[●○◐][[:space:]]*//' ;;
  esac
}
rename_tab_for_state() {
  tab_id="$1"
  current_name="$2"
  desired_state="$3"
  indicator_name="$4"
  restore_name="$5"
  stripped_name="$(strip_prefix "$current_name")"
  [ -n "$indicator_name" ] || indicator_name="$stripped_name"
  [ -n "$restore_name" ] || restore_name="$stripped_name"
  case "$desired_state" in
    attention) desired_name="$ATTENTION_PREFIX$indicator_name" ;;
    working) desired_name="$WORKING_PREFIX$indicator_name" ;;
    none) desired_name="$restore_name" ;;
    *) desired_name="$current_name" ;;
  esac

  if [ "$desired_name" != "$current_name" ]; then
    run_zellij rename-tab -t "$tab_id" "$desired_name" >/dev/null 2>&1 || true
  fi
}
cleanup() {
  rm -f "$PID_FILE" "$VERSION_FILE"
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
    latest_updated_at=0
    selected_indicator_name=""
    selected_restore_name=""
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

      updated_at="$(jq -r '.updatedAt // 0' "$pane_file" 2>/dev/null || echo 0)"
      case "$updated_at" in
        ''|*[!0-9]*) updated_at=0 ;;
      esac
      if [ "$updated_at" -ge "$latest_updated_at" ]; then
        latest_updated_at="$updated_at"
        selected_indicator_name="$(jq -r '.indicatorTabName // empty' "$pane_file" 2>/dev/null || true)"
        selected_restore_name="$(jq -r '.restoreTabName // empty' "$pane_file" 2>/dev/null || true)"
      fi
    done

    remaining=false
    for pane_file in "$tab_dir"/pane-*.json; do
      [ -f "$pane_file" ] || continue
      remaining=true
      break
    done

    current_tab_name="$(printf '%s' "$tabs_json" | jq -r --argjson tabId "$tab_id" '.[] | select(.tab_id == $tabId) | .name' 2>/dev/null | head -n 1 || true)"
    restore_tab_name="$selected_restore_name"
    indicator_tab_name="$selected_indicator_name"
    if [ -z "$restore_tab_name" ] && [ -n "$current_tab_name" ]; then
      restore_tab_name="$(strip_prefix "$current_tab_name")"
    fi
    if [ -z "$indicator_tab_name" ]; then
      indicator_tab_name="$restore_tab_name"
    fi

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
      rename_tab_for_state "$tab_id" "$current_tab_name" "$desired_state" "$indicator_tab_name" "$restore_tab_name"
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
      VERSION_FILE: pollerVersionFile(sessionName),
      SESSION_NAME: sessionName ?? "",
      ZELLIJ_EXECUTABLE: executable,
      ATTENTION_PREFIX: attentionPrefix,
      WORKING_PREFIX: workingPrefix,
    },
  })

  writeFileSync(pollerPidFile(sessionName), String(child.pid ?? ""), "utf8")
  writeFileSync(pollerVersionFile(sessionName), CURRENT_POLLER_VERSION, "utf8")
  child.unref()
  writeDebugLog({ event: "poller-end", elapsedMs: elapsedMs(startedAt), sessionName, pid: child.pid ?? null })
}

/**
 * Returns true if the current process is running inside a Zellij session.
 * Detected via the ZELLIJ environment variable set by Zellij itself.
 */
export function isZellijSession(): boolean {
  return process.env.ZELLIJ !== undefined
}

/**
 * Returns the current pane's raw tab name plus the best visible name for notifications/indicators.
 */
export async function getCurrentTabInfo(): Promise<CurrentTabInfo | null> {
  const startedAt = process.hrtime.bigint()
  const paneId = process.env.ZELLIJ_PANE_ID
  if (!paneId) {
    writeDebugLog({ event: "get-current-tab-info-skip", reason: "missing-pane-id" })
    return null
  }

  writeDebugLog({ event: "get-current-tab-info-start", paneId })

  try {
    const numericPaneId = Number.parseInt(paneId, 10)
    if (Number.isNaN(numericPaneId)) {
      writeDebugLog({ event: "get-current-tab-info-skip", reason: "invalid-pane-id", paneId })
      return null
    }

    const sessionName = process.env.ZELLIJ_SESSION_NAME ?? null
    const prefixes = [TAB_NOTIFY_PREFIX, TAB_WORKING_PREFIX]
    const metadataLookup = lookupPaneTabInfoFromSessionMetadata(sessionName, numericPaneId)
    const shouldReadPanes = !metadataLookup || isAutoTabName(metadataLookup.tabName)

    if (!shouldReadPanes && metadataLookup) {
      const visibleTabName = resolveVisibleTabName(metadataLookup.tabName, null, prefixes)
      writeDebugLog({
        event: "get-current-tab-info-end",
        elapsedMs: elapsedMs(startedAt),
        paneId,
        tabId: metadataLookup.tabId,
        tabName: metadataLookup.tabName,
        visibleTabName,
        sourceKind: "session-metadata",
      })
      return { tabId: metadataLookup.tabId, tabName: metadataLookup.tabName, visibleTabName }
    }

    const panesStartedAt = process.hrtime.bigint()
    const panesResult = runZellijActionSync(["list-panes", "--json", "--tab"], {
      sessionName,
      captureOutput: true,
      scrubEnv: true,
    })
    const panesStdout = typeof panesResult.stdout === "string" ? panesResult.stdout : ""
    writeDebugLog({
      event: "get-current-tab-info-panes-end",
      elapsedMs: elapsedMs(panesStartedAt),
      paneBytes: panesStdout.length,
      status: panesResult.status ?? null,
      error: panesResult.error ? String(panesResult.error) : null,
    })

    if (panesResult.error || panesResult.status !== 0 || panesStdout.length === 0) {
      if (metadataLookup) {
        const visibleTabName = resolveVisibleTabName(metadataLookup.tabName, null, prefixes)
        writeDebugLog({
          event: "get-current-tab-info-end",
          elapsedMs: elapsedMs(startedAt),
          paneId,
          tabId: metadataLookup.tabId,
          tabName: metadataLookup.tabName,
          visibleTabName,
          sourceKind: "session-metadata",
        })
        return { tabId: metadataLookup.tabId, tabName: metadataLookup.tabName, visibleTabName }
      }
      return null
    }

    const panes: Array<{ id: number; tab_id: number; tab_name?: string; title?: string; is_plugin?: boolean }> = JSON.parse(panesStdout)
    const matchingPanes = panes.filter((entry) => entry.id === numericPaneId)
    const ourPane = matchingPanes.find((entry) => entry.is_plugin === false) ?? matchingPanes[0] ?? null
    const paneTitle = typeof ourPane?.title === "string" ? ourPane.title : null

    if (metadataLookup) {
      const visibleTabName = resolveVisibleTabName(metadataLookup.tabName, paneTitle, prefixes)
      writeDebugLog({
        event: "get-current-tab-info-end",
        elapsedMs: elapsedMs(startedAt),
        paneId,
        tabId: metadataLookup.tabId,
        tabName: metadataLookup.tabName,
        visibleTabName,
        sourceKind: paneTitle ? "session-metadata+panes" : "session-metadata",
      })
      return { tabId: metadataLookup.tabId, tabName: metadataLookup.tabName, visibleTabName }
    }

    if (!ourPane) {
      writeDebugLog({ event: "get-current-tab-info-miss", elapsedMs: elapsedMs(startedAt), reason: "pane-not-found", paneId })
      return null
    }

    if (typeof ourPane.tab_name === "string" && ourPane.tab_name.length > 0) {
      const visibleTabName = resolveVisibleTabName(ourPane.tab_name, paneTitle, prefixes)
      writeDebugLog({
        event: "get-current-tab-info-end",
        elapsedMs: elapsedMs(startedAt),
        paneId,
        tabId: ourPane.tab_id,
        tabName: ourPane.tab_name,
        visibleTabName,
        sourceKind: "panes",
      })
      return { tabId: ourPane.tab_id, tabName: ourPane.tab_name, visibleTabName }
    }

    const tabsStartedAt = process.hrtime.bigint()
    const tabsResult = runZellijActionSync(["list-tabs", "--json"], {
      sessionName,
      captureOutput: true,
      scrubEnv: true,
    })
    const tabsStdout = typeof tabsResult.stdout === "string" ? tabsResult.stdout : ""
    writeDebugLog({
      event: "get-current-tab-info-tabs-end",
      elapsedMs: elapsedMs(tabsStartedAt),
      tabBytes: tabsStdout.length,
      status: tabsResult.status ?? null,
      error: tabsResult.error ? String(tabsResult.error) : null,
    })

    if (tabsResult.error || tabsResult.status !== 0) {
      return null
    }

    const tabs: Array<{ tab_id: number; active: boolean; name: string }> = JSON.parse(tabsStdout)
    const ourTab = tabs.find((entry) => entry.tab_id === ourPane.tab_id)
    if (!ourTab) {
      writeDebugLog({ event: "get-current-tab-info-miss", elapsedMs: elapsedMs(startedAt), reason: "tab-not-found", paneId, tabId: ourPane.tab_id })
      return null
    }

    const visibleTabName = resolveVisibleTabName(ourTab.name, paneTitle, prefixes)
    writeDebugLog({
      event: "get-current-tab-info-end",
      elapsedMs: elapsedMs(startedAt),
      paneId,
      tabId: ourTab.tab_id,
      tabName: ourTab.name,
      visibleTabName,
      sourceKind: "tabs",
    })

    return { tabId: ourTab.tab_id, tabName: ourTab.name, visibleTabName }
  } catch (error) {
    writeDebugLog({
      event: "get-current-tab-info-error",
      elapsedMs: elapsedMs(startedAt),
      paneId,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

/**
 * Adds an attention prefix to the given tab's name, records the originating pane as needing
 * attention, optionally applies a pane indicator, and ensures the session poller is running.
 */
export function markTabNotified(tabId: number, originalName: string, options: ZellijNotifyOptions = {}): void {
  const startedAt = process.hrtime.bigint()
  const sessionName = options.sessionName ?? process.env.ZELLIJ_SESSION_NAME ?? ""
  const originPaneId = options.originPaneId ?? Number.parseInt(process.env.ZELLIJ_PANE_ID ?? "", 10)
  const paneId = Number.isNaN(originPaneId) ? null : originPaneId
  const tabPrefix = currentTabPrefix(options.tabIndicator)
  const workingPrefix = currentWorkingPrefix(options.workingPrefix)
  const paneIndicator = options.paneIndicator
  const effectiveTabIndicatorEnabled = (options.tabIndicator?.enabled ?? true) || Boolean(paneIndicator?.enabled)
  const restoreTabName = stripKnownTabPrefixes(originalName, [tabPrefix, workingPrefix]).trim()
  const indicatorTabName = resolveVisibleTabName(originalName, options.visibleTabName, [tabPrefix, workingPrefix])
  const finalizeAuxiliaryWork = () => {
    const paneIndicatorApplied = paneId === null ? false : applyPaneIndicator(sessionName, paneId, paneIndicator)

    if (paneId !== null) {
      writePendingPaneState(sessionName, tabId, paneId, {
        paneId,
        updatedAt: Math.floor(Date.now() / 1000),
        attentionAt: Math.floor(Date.now() / 1000),
        workingAt: null,
        paneIndicatorApplied,
        indicatorTabName,
        restoreTabName,
      })
    }

    ensureSessionPoller(sessionName, tabPrefix, workingPrefix)
    writeDebugLog({ event: "mark-tab-notified-end", elapsedMs: elapsedMs(startedAt), tabId, paneId, paneIndicatorApplied })
  }

  writeDebugLog({ event: "mark-tab-notified-start", tabId, originalName, paneId, sessionName, deferred: Boolean(options.deferAuxiliaryWork) })

  if (!effectiveTabIndicatorEnabled || paneId === null) {
    writeDebugLog({
      event: "mark-tab-notified-skip",
      elapsedMs: elapsedMs(startedAt),
      tabId,
      paneId,
      reason: !effectiveTabIndicatorEnabled ? "indicator-disabled" : "missing-pane-id",
    })
    return
  }

  const desiredName = `${tabPrefix}${indicatorTabName}`

  try {
    const renameStartedAt = process.hrtime.bigint()
    writeDebugLog({ event: "rename-tab-start", tabId, currentName: originalName, desiredName })
    const result = runZellijActionSync(["rename-tab", "-t", String(tabId), desiredName], {
      sessionName,
    })
    writeDebugLog({
      event: "rename-tab-end",
      elapsedMs: elapsedMs(renameStartedAt),
      tabId,
      status: result.status ?? null,
      error: result.error ? String(result.error) : null,
    })
    if (result.error || result.status !== 0) return
  } catch (error) {
    writeDebugLog({
      event: "rename-tab-error",
      elapsedMs: elapsedMs(startedAt),
      tabId,
      error: error instanceof Error ? error.message : String(error),
    })
    return
  }

  if (options.deferAuxiliaryWork) {
    writeDebugLog({ event: "mark-tab-notified-defer-aux", elapsedMs: elapsedMs(startedAt), tabId, paneId })
    setTimeout(finalizeAuxiliaryWork, 0)
    return
  }

  finalizeAuxiliaryWork()
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

  const restoreTabName = stripKnownTabPrefixes(originalName, [tabPrefix, workingPrefix]).trim()
  const indicatorTabName = resolveVisibleTabName(originalName, options.visibleTabName, [tabPrefix, workingPrefix])
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
    indicatorTabName,
    restoreTabName,
  })

  // Preserve the current visible name in state. The poller derives the correct tab-level
  // state, including attention > working precedence across multiple panes.
  ensureSessionPoller(sessionName, tabPrefix, workingPrefix)
}

/**
 * Clears the working state for the current pane. Attention state, if any, is preserved.
 */
export function clearPaneWorking(tabId: number, options: ZellijNotifyOptions = {}): void {
  const startedAt = process.hrtime.bigint()
  const sessionName = options.sessionName ?? process.env.ZELLIJ_SESSION_NAME ?? ""
  const originPaneId = options.originPaneId ?? Number.parseInt(process.env.ZELLIJ_PANE_ID ?? "", 10)
  const paneId = Number.isNaN(originPaneId) ? null : originPaneId
  const tabPrefix = currentTabPrefix(options.tabIndicator)
  const workingPrefix = currentWorkingPrefix(options.workingPrefix)

  writeDebugLog({ event: "clear-pane-working-start", tabId, paneId, sessionName })

  if (paneId === null) {
    writeDebugLog({ event: "clear-pane-working-skip", elapsedMs: elapsedMs(startedAt), tabId, reason: "missing-pane-id" })
    return
  }

  const existing = readPendingPaneState(sessionName, tabId, paneId)
  if (!existing) {
    writeDebugLog({ event: "clear-pane-working-skip", elapsedMs: elapsedMs(startedAt), tabId, paneId, reason: "missing-state" })
    return
  }

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
  writeDebugLog({ event: "clear-pane-working-end", elapsedMs: elapsedMs(startedAt), tabId, paneId })
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
    const numericPaneId = Number.parseInt(paneId, 10)
    if (Number.isNaN(numericPaneId)) return true

    const sessionName = process.env.ZELLIJ_SESSION_NAME ?? null
    const metadataLookup = lookupPaneTabInfoFromSessionMetadata(sessionName, numericPaneId)
    if (metadataLookup) {
      return metadataLookup.active
    }

    const panesResult = runZellijActionSync(["list-panes", "--json"], {
      sessionName,
      captureOutput: true,
      scrubEnv: true,
    })
    const tabsResult = runZellijActionSync(["list-tabs", "--json"], {
      sessionName,
      captureOutput: true,
      scrubEnv: true,
    })

    if (panesResult.error || panesResult.status !== 0 || tabsResult.error || tabsResult.status !== 0) {
      return true
    }

    const panesStdout = typeof panesResult.stdout === "string" ? panesResult.stdout : ""
    const tabsStdout = typeof tabsResult.stdout === "string" ? tabsResult.stdout : ""
    const panes: Array<{ id: number; tab_id: number; is_plugin?: boolean }> = JSON.parse(panesStdout)
    const tabs: Array<{ tab_id: number; active: boolean }> = JSON.parse(tabsStdout)

    const matchingPanes = panes.filter((entry) => entry.id === numericPaneId)
    const ourPane = matchingPanes.find((entry) => entry.is_plugin === false) ?? matchingPanes[0]
    if (!ourPane) return true

    const ourTab = tabs.find((entry) => entry.tab_id === ourPane.tab_id)
    if (!ourTab) return true

    return ourTab.active
  } catch {
    return true
  }
}
