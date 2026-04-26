import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, isAbsolute, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { defaultConfigPath } from "@agent-notify/core"

export type InstallTarget = "all" | "pi" | "opencode" | "claude-code"

type ClaudeCodeAssets = {
  stop: string
  notification: string
  permissionRequest: string
}

type OpenCodeAssets = {
  indexJs: string
  indexDts?: string
  packageJson?: string
}

type PiAssets = {
  extension: string
}

type ResolvedAssets = {
  claudeCode: ClaudeCodeAssets
  opencode: OpenCodeAssets
  pi: PiAssets
}

type JsonRecord = Record<string, unknown>

type InstallEnvironment = {
  homeDir: string
  assets: ResolvedAssets
  configPath?: string
}

type ClaudeCodeHookCommand = {
  type?: string
  command?: string
  [key: string]: unknown
}

type ClaudeCodeHookMatcher = {
  matcher?: string
  hooks?: ClaudeCodeHookCommand[]
  [key: string]: unknown
}

const INSTALL_TARGETS: InstallTarget[] = ["all", "pi", "opencode", "claude-code"]
const MODULE_DIR = dirname(fileURLToPath(import.meta.url))

function unique<T>(items: T[]): T[] {
  return [...new Set(items)]
}

function ancestorDirs(start: string): string[] {
  const dirs: string[] = []
  let current = resolve(start)

  while (true) {
    dirs.push(current)
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }

  return dirs
}

function trustedCandidateRoots(): string[] {
  return unique([
    ...ancestorDirs(MODULE_DIR),
    ...ancestorDirs(dirname(process.execPath)),
  ])
}

function resolveAsset(relativePaths: string[]): string {
  for (const root of trustedCandidateRoots()) {
    for (const rel of relativePaths) {
      const candidate = join(root, rel)
      if (existsSync(candidate)) {
        return candidate
      }
    }
  }

  throw new Error(`Could not locate bundled integration asset. Tried: ${relativePaths.join(", ")}`)
}

export function resolveBundledAssets(): ResolvedAssets {
  return {
    claudeCode: {
      stop: resolveAsset([
        "libexec/claude-code/hooks/stop.sh",
        "claude-code/hooks/stop.sh",
        "packages/claude-code/hooks/stop.sh",
      ]),
      notification: resolveAsset([
        "libexec/claude-code/hooks/notification.sh",
        "claude-code/hooks/notification.sh",
        "packages/claude-code/hooks/notification.sh",
      ]),
      permissionRequest: resolveAsset([
        "libexec/claude-code/hooks/permission_request.sh",
        "claude-code/hooks/permission_request.sh",
        "packages/claude-code/hooks/permission_request.sh",
      ]),
    },
    opencode: {
      indexJs: resolveAsset([
        "libexec/opencode-agent-notify/dist/index.js",
        "opencode-agent-notify/dist/index.js",
        "packages/opencode/dist/index.js",
      ]),
      indexDts: (() => {
        try {
          return resolveAsset([
            "libexec/opencode-agent-notify/dist/index.d.ts",
            "opencode-agent-notify/dist/index.d.ts",
            "packages/opencode/dist/index.d.ts",
          ])
        } catch {
          return undefined
        }
      })(),
      packageJson: (() => {
        try {
          return resolveAsset([
            "libexec/opencode-agent-notify/package.json",
            "opencode-agent-notify/package.json",
            "packages/opencode/package.json",
          ])
        } catch {
          return undefined
        }
      })(),
    },
    pi: {
      extension: resolveAsset([
        "libexec/pi-coding-agent/agent-notify.ts",
        "pi-coding-agent/agent-notify.ts",
        "packages/pi-coding-agent/src/agent-notify.ts",
      ]),
    },
  }
}

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true })
}

function copyFile(from: string, to: string, mode?: number): void {
  ensureDir(dirname(to))
  copyFileSync(from, to)
  if (mode !== undefined) chmodSync(to, mode)
}

function readJson(path: string): JsonRecord {
  if (!existsSync(path)) return {}
  return JSON.parse(readFileSync(path, "utf8")) as JsonRecord
}

function writeJson(path: string, data: JsonRecord): void {
  ensureDir(dirname(path))
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf8")
}

function hasCommand(command: string): boolean {
  const pathValue = process.env.PATH ?? ""
  for (const part of pathValue.split(":")) {
    if (!part) continue
    if (existsSync(join(part, command))) return true
  }
  return false
}

function parseTarget(rawArgs: string[], fallback: InstallTarget = "all"): InstallTarget {
  const target = rawArgs.find((arg) => !arg.startsWith("-")) ?? fallback
  if (INSTALL_TARGETS.includes(target as InstallTarget)) {
    return target as InstallTarget
  }

  throw new Error(`Unknown install target: ${target}`)
}

function isClaudeAgentNotifyCommand(command: unknown, scriptName: string): boolean {
  if (typeof command !== "string") return false
  return command.includes("agent-notify") && (
    command.endsWith(`/claude-code/hooks/${scriptName}`)
    || command.endsWith(`/hooks/${scriptName}`)
    || command.endsWith(`/hooks/agent-notify/${scriptName}`)
    || command.includes("agent-notify.sh")
  )
}

function claudeHooksDir(homeDir: string): string {
  return join(homeDir, ".claude", "hooks", "agent-notify")
}

function legacyClaudeHooksRoot(homeDir: string): string {
  return join(homeDir, ".config", "agent-notify", "claude-code")
}

function installClaudeCode(env: InstallEnvironment): string[] {
  const hooksDir = claudeHooksDir(env.homeDir)
  const stopTarget = join(hooksDir, "stop.sh")
  const notificationTarget = join(hooksDir, "notification.sh")
  const permissionTarget = join(hooksDir, "permission_request.sh")

  copyFile(env.assets.claudeCode.stop, stopTarget, 0o755)
  copyFile(env.assets.claudeCode.notification, notificationTarget, 0o755)
  copyFile(env.assets.claudeCode.permissionRequest, permissionTarget, 0o755)

  const settingsPath = join(env.homeDir, ".claude", "settings.json")
  const settings = readJson(settingsPath)
  const hooks = (settings.hooks && typeof settings.hooks === "object") ? settings.hooks as Record<string, unknown> : {}
  settings.hooks = hooks

  const targets: Array<[string, string, string | undefined]> = [
    ["Stop", stopTarget, ""],
    ["Notification", notificationTarget, ""],
    ["PermissionRequest", permissionTarget, "*"],
  ]

  for (const [eventName, command, matcher] of targets) {
    const scriptName = command.split("/").at(-1) ?? ""
    const current = Array.isArray(hooks[eventName]) ? hooks[eventName] as ClaudeCodeHookMatcher[] : []

    if (current.some((entry) => Array.isArray(entry.hooks) && entry.hooks.some((hook) => hook.command === command))) {
      hooks[eventName] = current
      continue
    }

    let replaced = false
    const next = current.map((entry) => {
      const nested = Array.isArray(entry.hooks) ? entry.hooks : []
      const hasLegacy = nested.some((hook) => isClaudeAgentNotifyCommand(hook.command, scriptName))
      if (!hasLegacy) return entry
      replaced = true
      return {
        ...entry,
        hooks: nested.map((hook) => (
          isClaudeAgentNotifyCommand(hook.command, scriptName)
            ? { ...hook, type: "command", command }
            : hook
        )),
      }
    })

    if (!replaced) {
      next.push({
        ...(matcher !== undefined ? { matcher } : {}),
        hooks: [{ type: "command", command }],
      })
    }

    hooks[eventName] = next
  }

  writeJson(settingsPath, settings)
  rmSync(legacyClaudeHooksRoot(env.homeDir), { recursive: true, force: true })

  const messages = [
    `Claude Code hooks installed in ${settingsPath}`,
    `Claude Code hook scripts copied to ${hooksDir}`,
  ]

  if (!hasCommand("jq")) {
    messages.push("Warning: jq is not installed; Claude Code hooks need jq at runtime")
  }

  return messages
}

function pruneEmptyHookGroups(items: ClaudeCodeHookMatcher[]): ClaudeCodeHookMatcher[] {
  return items.filter((item) => Array.isArray(item.hooks) && item.hooks.length > 0)
}

function uninstallClaudeCode(homeDir: string): string[] {
  const settingsPath = join(homeDir, ".claude", "settings.json")
  const hooksDir = claudeHooksDir(homeDir)
  const legacyHooksDir = legacyClaudeHooksRoot(homeDir)
  const messages: string[] = []

  if (existsSync(settingsPath)) {
    const settings = readJson(settingsPath)
    const hooks = (settings.hooks && typeof settings.hooks === "object") ? settings.hooks as Record<string, unknown> : {}

    const targets: Array<[string, string]> = [
      ["Stop", "stop.sh"],
      ["Notification", "notification.sh"],
      ["PermissionRequest", "permission_request.sh"],
    ]

    for (const [eventName, scriptName] of targets) {
      const current = Array.isArray(hooks[eventName]) ? hooks[eventName] as ClaudeCodeHookMatcher[] : []
      const next = pruneEmptyHookGroups(current.map((entry) => ({
        ...entry,
        hooks: (Array.isArray(entry.hooks) ? entry.hooks : []).filter((hook) => !isClaudeAgentNotifyCommand(hook.command, scriptName)),
      })))

      if (next.length > 0) {
        hooks[eventName] = next
      } else {
        delete hooks[eventName]
      }
    }

    settings.hooks = hooks
    writeJson(settingsPath, settings)
    messages.push(`Claude Code hooks removed from ${settingsPath}`)
  } else {
    messages.push("Claude Code settings not found; nothing to remove")
  }

  rmSync(hooksDir, { recursive: true, force: true })
  rmSync(legacyHooksDir, { recursive: true, force: true })
  messages.push(`Claude hook scripts removed from ${hooksDir}`)

  return messages
}

function isLegacyOpenCodePlugin(entry: unknown): boolean {
  if (typeof entry !== "string") return false
  return entry === "opencode-agent-notify"
    || entry.includes("/opencode-agent-notify/")
    || entry.endsWith("/opencode-agent-notify")
    || entry.includes("file:///opt/homebrew/opt/agent-notify/libexec/opencode-agent-notify")
}

function installOpenCode(env: InstallEnvironment): string[] {
  const pluginDir = join(env.homeDir, ".config", "opencode", "plugins", "opencode-agent-notify")
  const pluginPath = join(pluginDir, "index.js")
  const configPath = join(env.homeDir, ".config", "opencode", "opencode.json")

  copyFile(env.assets.opencode.indexJs, pluginPath)
  if (env.assets.opencode.indexDts) copyFile(env.assets.opencode.indexDts, join(pluginDir, "index.d.ts"))
  if (env.assets.opencode.packageJson) copyFile(env.assets.opencode.packageJson, join(pluginDir, "package.json"))

  const config = readJson(configPath)
  const plugin = Array.isArray(config.plugin) ? config.plugin.filter((entry) => !isLegacyOpenCodePlugin(entry) || entry === pluginPath) : []
  config.plugin = unique([...plugin.filter((entry) => entry !== pluginPath), pluginPath])
  writeJson(configPath, config)

  return [
    `OpenCode plugin installed in ${pluginDir}`,
    `OpenCode config updated at ${configPath}`,
  ]
}

function uninstallOpenCode(homeDir: string): string[] {
  const pluginDir = join(homeDir, ".config", "opencode", "plugins", "opencode-agent-notify")
  const pluginPath = join(pluginDir, "index.js")
  const configPath = join(homeDir, ".config", "opencode", "opencode.json")
  const messages: string[] = []

  if (existsSync(configPath)) {
    const config = readJson(configPath)
    const plugin = Array.isArray(config.plugin) ? config.plugin.filter((entry) => typeof entry === "string" && entry !== pluginPath && !isLegacyOpenCodePlugin(entry)) : []
    config.plugin = plugin
    writeJson(configPath, config)
    messages.push(`OpenCode config updated at ${configPath}`)
  } else {
    messages.push("OpenCode config not found; nothing to remove")
  }

  rmSync(pluginDir, { recursive: true, force: true })
  messages.push(`OpenCode plugin removed from ${pluginDir}`)

  return messages
}

function installPi(env: InstallEnvironment): string[] {
  const target = join(env.homeDir, ".pi", "agent", "extensions", "agent-notify.ts")
  copyFile(env.assets.pi.extension, target)
  return [`Pi extension installed at ${target}`]
}

function uninstallPi(homeDir: string): string[] {
  const target = join(homeDir, ".pi", "agent", "extensions", "agent-notify.ts")
  rmSync(target, { force: true })
  return [`Pi extension removed from ${target}`]
}

export function installTargets(target: InstallTarget, env: InstallEnvironment): string[] {
  const selected = target === "all" ? ["claude-code", "opencode", "pi"] as const : [target] as const
  const messages: string[] = []

  for (const item of selected) {
    if (item === "claude-code") messages.push(...installClaudeCode(env))
    if (item === "opencode") messages.push(...installOpenCode(env))
    if (item === "pi") messages.push(...installPi(env))
  }

  const configPath = env.configPath ?? defaultConfigPath
  if (!existsSync(configPath)) {
    messages.push(`Config not found at ${configPath}; run \"agent-notify init\" if you have not configured sounds yet`)
  }

  return messages
}

export function uninstallTargets(target: InstallTarget, homeDir: string): string[] {
  const selected = target === "all" ? ["claude-code", "opencode", "pi"] as const : [target] as const
  const messages: string[] = []

  for (const item of selected) {
    if (item === "claude-code") messages.push(...uninstallClaudeCode(homeDir))
    if (item === "opencode") messages.push(...uninstallOpenCode(homeDir))
    if (item === "pi") messages.push(...uninstallPi(homeDir))
  }

  return messages
}

function resolveHomeDir(): string {
  const path = homedir()
  if (!path || !isAbsolute(path)) {
    throw new Error("Could not resolve a valid home directory")
  }

  return path
}

export async function cmdInstall(rawArgs: string[]): Promise<void> {
  const target = parseTarget(rawArgs)
  const messages = installTargets(target, {
    homeDir: resolveHomeDir(),
    assets: resolveBundledAssets(),
    configPath: defaultConfigPath,
  })

  console.log(`Installed ${target} integration${target === "all" ? "s" : ""}:`)
  for (const message of messages) {
    console.log(`  - ${message}`)
  }
}

export async function cmdUninstall(rawArgs: string[]): Promise<void> {
  const target = parseTarget(rawArgs)
  const messages = uninstallTargets(target, resolveHomeDir())

  console.log(`Uninstalled ${target} integration${target === "all" ? "s" : ""}:`)
  for (const message of messages) {
    console.log(`  - ${message}`)
  }
}
