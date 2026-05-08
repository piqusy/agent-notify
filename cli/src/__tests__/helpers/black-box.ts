import { spawn } from "node:child_process"
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * Shared black-box helpers live next to the CLI tests because their first
 * consumers are subprocess-level CLI and integration smoke tests. If other
 * packages start using them, promote this file to a top-level test-support dir.
 */

const HELPER_DIR = dirname(fileURLToPath(import.meta.url))
const CLI_ENTRYPOINT = resolve(HELPER_DIR, "..", "..", "index.ts")
const DEFAULT_TERMINAL_NAME = "agent-notify-black-box-terminal"
const SCRUBBED_ENV_VARS = [
  "AGENT_NOTIFY_DEBUG_LOG",
  "AGENT_NOTIFY_CLICK_SPIKE",
  "AGENT_NOTIFY_CLICK_SPIKE_KEEP_ALIVE_SECONDS",
  "AGENT_NOTIFY_TERMINAL",
  "KITTY_WINDOW_ID",
  "KITTY_LISTEN_ON",
  "WEZTERM_EXECUTABLE",
  "ZELLIJ",
  "ZELLIJ_SESSION_NAME",
  "ZELLIJ_PANE_ID",
]

type NotifyBackend = "macos-helper" | "osascript" | "notify-send" | "powershell"

type ConfigFile = {
  cooldownSeconds: number
  quietHours: { start: number; end: number } | null
  sounds: {
    done: string | null
    question: string | null
    permission: string | null
  }
  events: {
    done: boolean
    question: boolean
    permission: boolean
  }
  terminalApp: string | null
  backend: NotifyBackend | null
  clickRestore: {
    enabled: boolean
  }
  zellij: {
    tabIndicator: {
      enabled: boolean
      prefix: string
      workingPrefix: string
    }
    paneIndicator: {
      enabled: boolean
      mode: "background"
      bg: string | null
      clearOn: "origin-pane-focus"
    }
  }
}

type JsonRecord = Record<string, unknown>

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends JsonRecord ? DeepPartial<T[K]> : T[K]
}

export interface CapturedInvocation {
  command: string
  cwd: string
  args: string[]
  stdin: string
}

export interface CommandResult {
  exitCode: number
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
}

export interface RunCommandOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  stdin?: string
}

export interface TempGitRepo {
  path: string
  branch: string
}

export interface BlackBoxHarness {
  rootDir: string
  homeDir: string
  binDir: string
  tempDir: string
  captureLogPath: string
  backendCommand: string
  writeConfig: (overrides?: DeepPartial<ConfigFile>) => Promise<string>
  installCaptureCommand: (commandName: string) => Promise<string>
  clearCaptureLog: () => Promise<void>
  readCaptureLog: (commandName?: string) => Promise<CapturedInvocation[]>
  runCommand: (command: string, args?: string[], options?: RunCommandOptions) => Promise<CommandResult>
  runCli: (args: string[], options?: RunCommandOptions) => Promise<CommandResult>
  createGitRepo: (options?: { name?: string; branch?: string }) => Promise<TempGitRepo>
  cleanup: () => Promise<void>
}

const defaultBlackBoxConfig: ConfigFile = {
  cooldownSeconds: 0,
  quietHours: null,
  sounds: { done: null, question: null, permission: null },
  events: { done: true, question: true, permission: true },
  terminalApp: DEFAULT_TERMINAL_NAME,
  backend: null,
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
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function deepMerge<T extends JsonRecord>(base: T, overrides: DeepPartial<T> | undefined): T {
  if (!overrides) return structuredClone(base)

  const merged = structuredClone(base) as JsonRecord

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) continue

    const currentValue = merged[key]
    if (isJsonRecord(currentValue) && isJsonRecord(value)) {
      merged[key] = deepMerge(currentValue, value)
      continue
    }

    merged[key] = value
  }

  return merged as T
}

function applyEnvOverrides(env: NodeJS.ProcessEnv, overrides: NodeJS.ProcessEnv | undefined): NodeJS.ProcessEnv {
  if (!overrides) return env

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete env[key]
      continue
    }

    env[key] = value
  }

  return env
}

function cliRunnerCommand(): string {
  if (process.versions.bun) return process.execPath
  return process.env.BUN?.trim() || "bun"
}

export function backendCommandForPlatform(platform: NodeJS.Platform): string {
  if (platform === "darwin") return "osascript"
  if (platform === "linux") return "notify-send"

  throw new Error(`Black-box harness currently supports darwin and linux only, not ${platform}`)
}

function buildCaptureScript(commandName: string): string {
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
    'node -e \'const fs = require("node:fs"); const path = require("node:path"); const [, logFile, commandPath, cwd, ...args] = process.argv; const stdin = fs.readFileSync(0, "utf8"); fs.appendFileSync(logFile, JSON.stringify({ command: path.basename(commandPath), cwd, args, stdin }) + "\\n", "utf8")\' -- "$AGENT_NOTIFY_CAPTURE_LOG" "$0" "$PWD" "$@"',
    "",
  ].filter(Boolean).join("\n")
}

async function writeExecutable(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content, "utf8")
  await chmod(path, 0o755)
}

async function readJsonLines(path: string): Promise<CapturedInvocation[]> {
  try {
    const raw = await readFile(path, "utf8")
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as CapturedInvocation)
  } catch {
    return []
  }
}

async function runProcess(command: string, args: string[], options: {
  cwd: string
  env: NodeJS.ProcessEnv
  stdin?: string
}): Promise<CommandResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: "pipe",
    })

    let stdout = ""
    let stderr = ""

    child.stdout?.setEncoding("utf8")
    child.stdout?.on("data", (chunk) => {
      stdout += chunk
    })

    child.stderr?.setEncoding("utf8")
    child.stderr?.on("data", (chunk) => {
      stderr += chunk
    })

    child.on("error", (error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT" && command === "bun") {
        rejectPromise(new Error("bun is required to run black-box CLI tests"))
        return
      }

      rejectPromise(error)
    })

    child.on("close", (exitCode, signal) => {
      resolvePromise({
        exitCode: exitCode ?? -1,
        signal,
        stdout,
        stderr,
      })
    })

    if (options.stdin !== undefined) {
      child.stdin?.write(options.stdin)
    }

    child.stdin?.end()
  })
}

function buildSandboxEnv(options: {
  homeDir: string
  binDir: string
  tempDir: string
  captureLogPath: string
  env?: NodeJS.ProcessEnv
}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }

  for (const name of SCRUBBED_ENV_VARS) {
    delete env[name]
  }

  env.HOME = options.homeDir
  env.USERPROFILE = options.homeDir
  env.XDG_CONFIG_HOME = join(options.homeDir, ".config")
  env.TMPDIR = options.tempDir
  env.TMP = options.tempDir
  env.TEMP = options.tempDir
  env.PATH = [options.binDir, process.env.PATH ?? ""].filter(Boolean).join(":")
  env.AGENT_NOTIFY_CAPTURE_LOG = options.captureLogPath
  env.AGENT_NOTIFY_TERMINAL = DEFAULT_TERMINAL_NAME

  return applyEnvOverrides(env, options.env)
}

async function runSuccessfulCommand(command: string, args: string[], options: {
  cwd: string
  env: NodeJS.ProcessEnv
  stdin?: string
}): Promise<void> {
  const result = await runProcess(command, args, options)
  if (result.exitCode === 0) return

  throw new Error([
    `Command failed: ${command} ${args.join(" ")}`,
    `exitCode=${result.exitCode}`,
    result.stdout && `stdout:\n${result.stdout}`,
    result.stderr && `stderr:\n${result.stderr}`,
  ].filter(Boolean).join("\n\n"))
}

export async function createBlackBoxHarness(): Promise<BlackBoxHarness> {
  const rootDir = await mkdtemp(join(tmpdir(), "agent-notify-black-box-"))
  const homeDir = join(rootDir, "home")
  const binDir = join(rootDir, "bin")
  const tempDir = join(rootDir, "tmp")
  const captureLogPath = join(rootDir, "capture.jsonl")
  const backendCommand = backendCommandForPlatform(process.platform)

  await mkdir(homeDir, { recursive: true })
  await mkdir(binDir, { recursive: true })
  await mkdir(tempDir, { recursive: true })

  async function installCaptureCommand(commandName: string): Promise<string> {
    const path = join(binDir, commandName)
    await writeExecutable(path, buildCaptureScript(commandName))
    return path
  }

  await installCaptureCommand(backendCommand)

  async function writeConfig(overrides: DeepPartial<ConfigFile> = {}): Promise<string> {
    const configPath = join(homeDir, ".config", "agent-notify", "config.json")
    const config = deepMerge(defaultBlackBoxConfig, {
      backend: backendCommand as NotifyBackend,
      ...overrides,
    })

    await mkdir(dirname(configPath), { recursive: true })
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8")
    return configPath
  }

  async function clearCaptureLog(): Promise<void> {
    await writeFile(captureLogPath, "", "utf8")
  }

  async function readCaptureLog(commandName?: string): Promise<CapturedInvocation[]> {
    const entries = await readJsonLines(captureLogPath)
    return commandName ? entries.filter((entry) => entry.command === commandName) : entries
  }

  async function runCommand(command: string, args: string[] = [], options: RunCommandOptions = {}): Promise<CommandResult> {
    return runProcess(command, args, {
      cwd: options.cwd ?? rootDir,
      env: buildSandboxEnv({
        homeDir,
        binDir,
        tempDir,
        captureLogPath,
        env: options.env,
      }),
      stdin: options.stdin,
    })
  }

  async function runCli(args: string[], options: RunCommandOptions = {}): Promise<CommandResult> {
    return runCommand(cliRunnerCommand(), [CLI_ENTRYPOINT, ...args], options)
  }

  async function createGitRepo(options: { name?: string; branch?: string } = {}): Promise<TempGitRepo> {
    const projectName = options.name ?? "black-box-project"
    const branch = options.branch ?? "black-box-main"
    const path = join(rootDir, projectName)

    await mkdir(path, { recursive: true })
    await runSuccessfulCommand("git", ["init"], {
      cwd: path,
      env: buildSandboxEnv({ homeDir, binDir, tempDir, captureLogPath }),
    })
    await runSuccessfulCommand("git", ["checkout", "-b", branch], {
      cwd: path,
      env: buildSandboxEnv({ homeDir, binDir, tempDir, captureLogPath }),
    })
    await runSuccessfulCommand("git", ["config", "user.name", "Agent Notify Tests"], {
      cwd: path,
      env: buildSandboxEnv({ homeDir, binDir, tempDir, captureLogPath }),
    })
    await runSuccessfulCommand("git", ["config", "user.email", "agent-notify-tests@example.com"], {
      cwd: path,
      env: buildSandboxEnv({ homeDir, binDir, tempDir, captureLogPath }),
    })
    await runSuccessfulCommand("git", ["config", "commit.gpgsign", "false"], {
      cwd: path,
      env: buildSandboxEnv({ homeDir, binDir, tempDir, captureLogPath }),
    })

    await writeFile(join(path, "README.md"), `# ${projectName}\n`, "utf8")
    await runSuccessfulCommand("git", ["add", "README.md"], {
      cwd: path,
      env: buildSandboxEnv({ homeDir, binDir, tempDir, captureLogPath }),
    })
    await runSuccessfulCommand("git", ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "commit", "-m", "Initial commit"], {
      cwd: path,
      env: buildSandboxEnv({ homeDir, binDir, tempDir, captureLogPath }),
    })

    return { path, branch }
  }

  async function cleanup(): Promise<void> {
    await rm(rootDir, { recursive: true, force: true })
  }

  return {
    rootDir,
    homeDir,
    binDir,
    tempDir,
    captureLogPath,
    backendCommand,
    writeConfig,
    installCaptureCommand,
    clearCaptureLog,
    readCaptureLog,
    runCommand,
    runCli,
    createGitRepo,
    cleanup,
  }
}
