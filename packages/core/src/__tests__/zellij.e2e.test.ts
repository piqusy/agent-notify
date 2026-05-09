import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { spawnSync, type SpawnSyncReturns } from "node:child_process"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

type TabInfo = {
  name: string
  tab_id: number
}

type PaneInfo = {
  id: number
  is_plugin?: boolean
  tab_id: number
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

type LiveZellijHarness = {
  rootDir: string
  homeDir: string
  tempDir: string
  binDir: string
  workDir: string
  sessionName: string
  tabId: number
  paneId: number
  baseTabName: string
  stateRoot: string
  env: NodeJS.ProcessEnv
  cleanup: () => void
}

function cliRunnerCommand(): string {
  if (process.versions.bun) return process.execPath
  return process.env.BUN?.trim() || "bun"
}

function commandAvailable(command: string, args: string[] = ["--version"]): boolean {
  const result = spawnSync(command, args, { stdio: "ignore" })
  return !result.error && result.status === 0
}

const shouldRunZellijE2E =
  (process.platform === "darwin" || process.platform === "linux")
  && process.env.ZELLIJ_E2E === "1"
  && commandAvailable("zellij")
  && commandAvailable(cliRunnerCommand(), ["--version"])

const describeZellijE2E = shouldRunZellijE2E ? describe : describe.skip
const CLI_ENTRYPOINT = resolve(process.cwd(), "cli", "src", "index.ts")

function backendCommandForPlatform(): "osascript" | "notify-send" {
  return process.platform === "darwin" ? "osascript" : "notify-send"
}

function fakeBackendScript(commandName: string): string {
  const maybeProxyOsascript = commandName === "osascript"
    ? [
        'if [ "${1:-}" = "-e" ] && [[ "${2:-}" == "display notification"* ]]; then',
        '  :',
        'else',
        '  exec /usr/bin/osascript "$@"',
        'fi',
        '',
      ].join("\n")
    : ""

  return [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    maybeProxyOsascript,
    'node -e \'const fs = require("node:fs"); const path = require("node:path"); const [, logFile, commandPath, cwd, ...args] = process.argv; fs.appendFileSync(logFile, JSON.stringify({ command: path.basename(commandPath), cwd, args }) + "\\n", "utf8")\' -- "$AGENT_NOTIFY_BACKEND_LOG" "$0" "$PWD" "$@"',
    "",
  ].filter(Boolean).join("\n")
}

function writeExecutable(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content, "utf8")
  chmodSync(path, 0o755)
}

function configJson(commandName: "osascript" | "notify-send", terminalAppName: string): string {
  return `${JSON.stringify({
    cooldownSeconds: 0,
    quietHours: null,
    sounds: { done: null, question: null, permission: null },
    events: { done: true, question: true, permission: true },
    terminalApp: terminalAppName,
    backend: commandName,
    clickRestore: { enabled: false },
    zellij: {
      tabIndicator: {
        enabled: true,
        prefix: " ● ",
        workingPrefix: " ○ ",
      },
      paneIndicator: {
        enabled: false,
        mode: "background",
        bg: "#3c3836",
        clearOn: "origin-pane-focus",
      },
    },
  }, null, 2)}\n`
}

function runSync(command: string, args: string[], options: {
  cwd?: string
  env?: NodeJS.ProcessEnv
  stdio?: "ignore" | "pipe"
  timeout?: number
} = {}): SpawnSyncReturns<string> {
  return spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: options.stdio ?? "pipe",
    encoding: "utf8",
    timeout: options.timeout,
  })
}

function assertCommandSucceeded(result: SpawnSyncReturns<string>, label: string): void {
  if (!result.error && result.status === 0) return

  throw new Error([
    `Command failed: ${label}`,
    `status=${result.status ?? "null"}`,
    result.error ? `error=${String(result.error)}` : "",
    result.stdout ? `stdout:\n${result.stdout}` : "",
    result.stderr ? `stderr:\n${result.stderr}` : "",
  ].filter(Boolean).join("\n\n"))
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`
}

function runZellijCommand(args: string[], env: NodeJS.ProcessEnv, options: { cwd?: string; timeout?: number; stdio?: "ignore" | "pipe" } = {}): SpawnSyncReturns<string> {
  const command = ["zellij", ...args].map(shellEscape).join(" ")
  return runSync("bash", ["-lc", command], {
    cwd: options.cwd,
    env,
    stdio: options.stdio,
    timeout: options.timeout,
  })
}

function stripAnsi(value: string): string {
  return value.replace(/\u001B\[[0-9;?]*[ -/]*[@-~]/g, "")
}

function parseJsonOutput<T>(stdout: string, label: string): T {
  const sanitized = stripAnsi(stdout).trim()
  const arrayStart = sanitized.indexOf("[")
  const objectStart = sanitized.indexOf("{")
  const starts = [arrayStart, objectStart].filter((index) => index >= 0)
  if (starts.length === 0) {
    throw new Error(`Expected JSON output for ${label}, got: ${sanitized || "(empty)"}`)
  }

  const start = Math.min(...starts)
  const trimmed = sanitized.slice(start)
  const arrayEnd = trimmed.lastIndexOf("]")
  const objectEnd = trimmed.lastIndexOf("}")
  const end = Math.max(arrayEnd, objectEnd)
  const payload = end >= 0 ? trimmed.slice(0, end + 1) : trimmed
  return JSON.parse(payload) as T
}

function parseNumericOutput(stdout: string, label: string): number {
  const match = stripAnsi(stdout).match(/(\d+)/)
  if (!match) {
    throw new Error(`Expected numeric output for ${label}, got: ${stdout || "(empty)"}`)
  }

  return Number.parseInt(match[1], 10)
}

function sessionExists(sessionName: string, env: NodeJS.ProcessEnv): boolean {
  const result = runZellijCommand(["list-sessions"], env)
  if (result.error || result.status !== 0) return false
  return stripAnsi(result.stdout).includes(sessionName)
}

function readTabs(sessionName: string, env: NodeJS.ProcessEnv): TabInfo[] {
  const result = runZellijCommand(["--session", sessionName, "action", "list-tabs", "--json"], env)
  assertCommandSucceeded(result, `zellij list-tabs (${sessionName})`)
  return parseJsonOutput<TabInfo[]>(result.stdout, `zellij list-tabs (${sessionName})`)
}

function readPanes(sessionName: string, env: NodeJS.ProcessEnv): PaneInfo[] {
  const result = runZellijCommand(["--session", sessionName, "action", "list-panes", "--json", "--tab"], env)
  assertCommandSucceeded(result, `zellij list-panes (${sessionName})`)
  return parseJsonOutput<PaneInfo[]>(result.stdout, `zellij list-panes (${sessionName})`)
}

function createDedicatedTab(sessionName: string, name: string, cwd: string, env: NodeJS.ProcessEnv): number {
  const result = runZellijCommand([
    "--session",
    sessionName,
    "action",
    "new-tab",
    "--name",
    name,
    "--cwd",
    cwd,
    "--",
    "/bin/sh",
    "-lc",
    "sleep 300",
  ], env)
  assertCommandSucceeded(result, `zellij new-tab (${sessionName}, ${name})`)
  return parseNumericOutput(result.stdout, `zellij new-tab (${sessionName}, ${name})`)
}

function renameTab(sessionName: string, tabId: number, name: string, env: NodeJS.ProcessEnv): void {
  const result = runZellijCommand(["--session", sessionName, "action", "rename-tab", "-t", String(tabId), name], env)
  assertCommandSucceeded(result, `zellij rename-tab (${sessionName}, ${tabId}, ${name})`)
}

async function waitFor<T>(description: string, readValue: () => T, isReady: (value: T) => boolean, timeoutMs = 10_000): Promise<T> {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    const value = readValue()
    if (isReady(value)) return value
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100))
  }

  throw new Error(`Timed out waiting for ${description}`)
}

function pendingPanePath(harness: LiveZellijHarness): string {
  return join(harness.stateRoot, `tab-${harness.tabId}`, `pane-${harness.paneId}.json`)
}

function readPendingPaneState(harness: LiveZellijHarness): PendingPaneState | null {
  const path = pendingPanePath(harness)
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, "utf8")) as PendingPaneState
}

function runCli(harness: LiveZellijHarness, args: string[]): void {
  const result = runSync(cliRunnerCommand(), [CLI_ENTRYPOINT, ...args], {
    cwd: harness.workDir,
    env: harness.env,
    timeout: 30_000,
  })
  assertCommandSucceeded(result, `agent-notify ${args.join(" ")}`)
}

function startSession(sessionName: string, cwd: string, env: NodeJS.ProcessEnv): void {
  // Starting Zellij without a TTY creates the session and then exits/panics when it
  // cannot enter raw mode. Wrapping the command in bash preserves the same behavior
  // under Node's non-interactive child-process environment.
  runZellijCommand(["-s", sessionName], env, {
    cwd,
    stdio: "ignore",
    timeout: 5_000,
  })
}

function stopSessionPoller(harness: LiveZellijHarness): void {
  const pidFile = join(harness.stateRoot, "poller.pid")
  if (!existsSync(pidFile)) return

  const pid = Number.parseInt(readFileSync(pidFile, "utf8").trim(), 10)
  if (!Number.isFinite(pid)) return

  try {
    process.kill(pid)
  } catch {
    // best effort
  }
}

function removeDirWithRetries(path: string): void {
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      rmSync(path, { recursive: true, force: true })
      return
    } catch {
      runSync("bash", ["-lc", "sleep 0.1"], { stdio: "ignore", timeout: 1_000 })
    }
  }

  rmSync(path, { recursive: true, force: true })
}

async function createLiveZellijHarness(): Promise<LiveZellijHarness> {
  const rootDir = mkdtempSync(join(tmpdir(), "agent-notify-zellij-e2e-"))
  const homeDir = join(rootDir, "home")
  const tempDir = join(rootDir, "tmp")
  const binDir = join(rootDir, "bin")
  const workDir = join(homeDir, "workspace")
  const sessionName = `a${Math.random().toString(36).slice(2, 4)}${Date.now().toString(36).slice(-4)}`
  const baseTabName = `e2e-${sessionName}`
  const terminalAppName = `AgentNotifyZellijE2E-${sessionName}`
  const backendLogPath = join(rootDir, "backend.jsonl")
  const commandName = backendCommandForPlatform()

  mkdirSync(homeDir, { recursive: true })
  mkdirSync(tempDir, { recursive: true })
  mkdirSync(binDir, { recursive: true })
  mkdirSync(workDir, { recursive: true })
  mkdirSync(join(homeDir, ".config", "agent-notify"), { recursive: true })

  writeExecutable(join(binDir, commandName), fakeBackendScript(commandName))
  writeFileSync(join(homeDir, ".config", "agent-notify", "config.json"), configJson(commandName, terminalAppName), "utf8")

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: homeDir,
    USERPROFILE: homeDir,
    PATH: [binDir, process.env.PATH ?? ""].filter(Boolean).join(":"),
    AGENT_NOTIFY_BACKEND_LOG: backendLogPath,
    NO_COLOR: "1",
    CLICOLOR: "0",
  }

  startSession(sessionName, workDir, env)

  await waitFor(
    `zellij session ${sessionName} to exist`,
    () => sessionExists(sessionName, env),
    (exists) => exists,
  )

  const tabId = createDedicatedTab(sessionName, baseTabName, workDir, env)
  const livePane = await waitFor(
    `live pane in zellij session ${sessionName} tab ${tabId}`,
    () => readPanes(sessionName, env).find((pane) => pane.is_plugin === false && pane.tab_id === tabId) ?? null,
    (pane): pane is PaneInfo => pane !== null,
  )
  if (!livePane) {
    throw new Error(`Could not find a live pane in session ${sessionName} tab ${tabId}`)
  }

  renameTab(sessionName, tabId, baseTabName, env)
  const tabs = readTabs(sessionName, env)
  if (!tabs.some((tab) => tab.tab_id === tabId && tab.name === baseTabName)) {
    throw new Error(`Could not rename tab ${tabId} to ${baseTabName}`)
  }

  const stateRoot = join(tmpdir(), `agent-notify-zellij-state-${sessionName}`)

  env.ZELLIJ = "1"
  env.ZELLIJ_SESSION_NAME = sessionName
  env.ZELLIJ_PANE_ID = String(livePane.id)

  return {
    rootDir,
    homeDir,
    tempDir,
    binDir,
    workDir,
    sessionName,
    tabId,
    paneId: livePane.id,
    baseTabName,
    stateRoot,
    env,
    cleanup: () => {
      stopSessionPoller({
        rootDir,
        homeDir,
        tempDir,
        binDir,
        workDir,
        sessionName,
        tabId,
        paneId: livePane.id,
        baseTabName,
        stateRoot,
        env,
        cleanup: () => undefined,
      })
      runZellijCommand(["kill-session", sessionName], env, { stdio: "ignore", timeout: 5_000 })
      removeDirWithRetries(stateRoot)
      removeDirWithRetries(rootDir)
    },
  }
}

describeZellijE2E("live zellij E2E", () => {
  const harnesses: LiveZellijHarness[] = []

  async function createHarness(): Promise<LiveZellijHarness> {
    const harness = await createLiveZellijHarness()
    harnesses.push(harness)
    return harness
  }

  afterEach(() => {
    while (harnesses.length > 0) {
      harnesses.pop()?.cleanup()
    }
  })

  it("marks the live tab as working via the public CLI", async () => {
    const harness = await createHarness()

    runCli(harness, ["working-start"])

    const tabName = await waitFor(
      "working tab rename",
      () => readTabs(harness.sessionName, harness.env).find((entry) => entry.tab_id === harness.tabId)?.name ?? null,
      (name): name is string => name === ` ○ ${harness.baseTabName}`,
    )

    const state = await waitFor(
      "working pane state",
      () => readPendingPaneState(harness),
      (entry): entry is PendingPaneState => entry !== null && typeof entry.workingAt === "number",
    )

    expect(tabName).toBe(` ○ ${harness.baseTabName}`)
    expect(state).toEqual(expect.objectContaining({
      paneId: harness.paneId,
      attentionAt: null,
      workingAt: expect.any(Number),
      indicatorTabName: harness.baseTabName,
      restoreTabName: harness.baseTabName,
    }))
  }, 30_000)

  it("marks the live tab as notified and clears the working state on done", async () => {
    const harness = await createHarness()

    runCli(harness, ["working-start"])
    await waitFor(
      "working tab rename before done",
      () => readTabs(harness.sessionName, harness.env).find((entry) => entry.tab_id === harness.tabId)?.name ?? null,
      (name): name is string => name === ` ○ ${harness.baseTabName}`,
    )

    runCli(harness, ["done", harness.workDir, "--tool", "cli"])

    const tabName = await waitFor(
      "done tab rename",
      () => readTabs(harness.sessionName, harness.env).find((entry) => entry.tab_id === harness.tabId)?.name ?? null,
      (name): name is string => name === ` ● ${harness.baseTabName}`,
    )

    const state = await waitFor(
      "attention pane state",
      () => readPendingPaneState(harness),
      (entry): entry is PendingPaneState => entry !== null && typeof entry.attentionAt === "number" && entry.workingAt === null,
    )

    expect(tabName).toBe(` ● ${harness.baseTabName}`)
    expect(state).toEqual(expect.objectContaining({
      paneId: harness.paneId,
      attentionAt: expect.any(Number),
      workingAt: null,
      indicatorTabName: harness.baseTabName,
      restoreTabName: harness.baseTabName,
    }))
  }, 30_000)

  it("restores the live tab name and removes pending state on working-stop", async () => {
    const harness = await createHarness()

    runCli(harness, ["working-start"])
    await waitFor(
      "working tab rename before stop",
      () => readTabs(harness.sessionName, harness.env).find((entry) => entry.tab_id === harness.tabId)?.name ?? null,
      (name): name is string => name === ` ○ ${harness.baseTabName}`,
    )

    runCli(harness, ["working-stop"])

    const restoredName = await waitFor(
      "restored tab name",
      () => readTabs(harness.sessionName, harness.env).find((entry) => entry.tab_id === harness.tabId)?.name ?? null,
      (name): name is string => name === harness.baseTabName,
    )

    await waitFor(
      "removed pending zellij state",
      () => existsSync(harness.stateRoot),
      (stateDirExists) => stateDirExists === false,
    )

    expect(restoredName).toBe(harness.baseTabName)
    expect(existsSync(pendingPanePath(harness))).toBe(false)
  }, 30_000)
})
