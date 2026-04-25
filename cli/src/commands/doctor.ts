import { execFileSync, execSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import {
  defaultConfigPath,
  loadConfig,
  resolveTerminalApp,
  isTerminalFocused,
  isQuietHour,
  detectMacOSBackend,
  findMacOSHelperApp,
  findMacOSHelperBinary,
  BUILTIN_SOUNDS,
} from "@agent-notify/core"
import type { Config, NotifyBackend } from "@agent-notify/core"

const OK = "\u2713"
const WARN = "!"
const FAIL = "\u2717"

function line(symbol: string, label: string, detail: string): void {
  const pad = " ".repeat(Math.max(1, 18 - label.length))
  console.log(`  ${symbol} ${label}${pad}${detail}`)
}

function getMacOSVersion(): string | null {
  try {
    return execSync("sw_vers -productVersion", { encoding: "utf8" }).trim()
  } catch {
    return null
  }
}

function checkMacOSHelperPermission(): { enabled: boolean | null; detail: string } {
  const helperBinary = findMacOSHelperBinary()
  if (!helperBinary) {
    return { enabled: null, detail: "Native helper binary not found" }
  }

  try {
    const status = execFileSync(helperBinary, ["--permission-status"], {
      encoding: "utf8",
      timeout: 5000,
    }).trim()

    if (status === "authorized" || status === "provisional" || status === "ephemeral") {
      return { enabled: true, detail: `Notifications allowed (${status})` }
    }
    if (status === "denied") {
      return { enabled: false, detail: "Notifications DISABLED for Agent Notify" }
    }
    if (status === "notDetermined") {
      return { enabled: null, detail: "Permission not requested yet — send a test notification to trigger the prompt" }
    }

    return { enabled: null, detail: `Unknown helper status: ${status || "(empty)"}` }
  } catch (error) {
    return {
      enabled: null,
      detail: `Could not query helper permission status: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

function checkSoundFile(soundName: string | null): { found: boolean; path: string | null } {
  if (!soundName) return { found: true, path: null }
  const p = `/System/Library/Sounds/${soundName}.aiff`
  return { found: existsSync(p), path: p }
}

function describeIconBehavior(backend: NotifyBackend | null): { level: "ok" | "warn"; detail: string } {
  if (process.platform === "darwin") {
    if (backend === "macos-helper") {
      return { level: "ok", detail: "Bundled Agent Notify app icon will be used" }
    }
    return { level: "warn", detail: "Fallback backend uses the default macOS notification icon" }
  }

  return { level: "ok", detail: "Platform default icon will be used" }
}

export async function cmdDoctor(): Promise<void> {
  console.log("agent-notify doctor")
  console.log("====================\n")

  const configExists = existsSync(defaultConfigPath)
  let config: Config | null = null
  if (configExists) {
    try {
      const raw = readFileSync(defaultConfigPath, "utf8")
      JSON.parse(raw)
      config = await loadConfig(defaultConfigPath)
      line(OK, "Config", defaultConfigPath)
    } catch (e) {
      line(FAIL, "Config", `${defaultConfigPath} — invalid JSON: ${e instanceof Error ? e.message : e}`)
    }
  } else {
    line(WARN, "Config", `${defaultConfigPath} — not found (using defaults)`)
    config = await loadConfig()
  }

  if (!config) {
    console.log("\nCannot continue without a valid config.")
    return
  }

  const macVer = getMacOSVersion()
  if (macVer) {
    line(OK, "macOS", macVer)
  } else {
    line(OK, "Platform", process.platform)
  }

  let resolvedBackend: NotifyBackend | null = null
  if (process.platform === "darwin") {
    const origStderrWrite = process.stderr.write
    process.stderr.write = (() => true) as typeof process.stderr.write
    resolvedBackend = await detectMacOSBackend(config.backend)
    process.stderr.write = origStderrWrite

    const helperApp = findMacOSHelperApp()
    if (resolvedBackend === "macos-helper") {
      if (helperApp) {
        line(OK, "Backend", `${resolvedBackend}${config.backend ? " (explicit override)" : " (auto-detected)"} — ${helperApp}`)
      } else {
        line(FAIL, "Backend", "macos-helper selected but bundled helper app was not found")
      }
    } else {
      line(WARN, "Backend", `${resolvedBackend}${config.backend ? " (explicit override)" : " (auto-detected fallback)"}`)
    }

    const perms = resolvedBackend === "macos-helper"
      ? checkMacOSHelperPermission()
      : { enabled: null, detail: "Backend does not expose permission status" }

    if (perms.enabled === true) {
      line(OK, "Permissions", perms.detail)
    } else if (perms.enabled === false) {
      line(FAIL, "Permissions", perms.detail)
      if (resolvedBackend === "macos-helper") {
        console.log("                    → Open System Settings > Notifications > Agent Notify > Allow Notifications")
      }
    } else {
      line(WARN, "Permissions", perms.detail)
    }
  }

  const termProgram = process.env.TERM_PROGRAM ?? ""
  const termApp = config.terminalApp ?? resolveTerminalApp(termProgram)
  if (termApp) {
    const focused = await isTerminalFocused(termApp)
    if (focused) {
      line(WARN, "Focus", `${termApp} is frontmost — notifications would be suppressed`)
    } else {
      line(OK, "Focus", `${termApp} is not frontmost — notifications will be sent`)
    }
  } else {
    line(WARN, "Focus", `Could not detect terminal app (TERM_PROGRAM=${termProgram || "(empty)"}) — focus check skipped`)
  }

  if (config.quietHours === null) {
    line(OK, "Quiet hours", "Disabled")
  } else {
    const quiet = isQuietHour(config.quietHours)
    const hour = new Date().getHours()
    if (quiet) {
      line(WARN, "Quiet hours", `Active (${config.quietHours.start}:00–${config.quietHours.end}:00, current: ${hour}:00) — sounds muted`)
    } else {
      line(OK, "Quiet hours", `Inactive (${config.quietHours.start}:00–${config.quietHours.end}:00, current: ${hour}:00)`)
    }
  }

  const enabled = Object.entries(config.events)
    .filter(([, v]) => v)
    .map(([k]) => k)
  const disabled = Object.entries(config.events)
    .filter(([, v]) => !v)
    .map(([k]) => k)
  if (disabled.length === 0) {
    line(OK, "Events", `All enabled (${enabled.join(", ")})`)
  } else {
    line(WARN, "Events", `Enabled: ${enabled.join(", ")} | Disabled: ${disabled.join(", ")}`)
  }

  const iconInfo = describeIconBehavior(resolvedBackend)
  if (iconInfo.level === "ok") {
    line(OK, "Icon", iconInfo.detail)
  } else {
    line(WARN, "Icon", iconInfo.detail)
  }

  for (const key of ["done", "question", "permission"] as const) {
    const soundName = config.sounds[key]
    if (soundName === null && key === "permission") {
      line(OK, "Sound/permission", "Falls back to question sound")
      continue
    }
    if (soundName === null) {
      line(OK, `Sound/${key}`, "Silent")
      continue
    }

    if (process.platform === "darwin" && BUILTIN_SOUNDS.includes(soundName as (typeof BUILTIN_SOUNDS)[number])) {
      line(OK, `Sound/${key}`, `${soundName} (built-in macOS sound)`)
      continue
    }

    const { found, path } = checkSoundFile(soundName)
    if (found) {
      line(OK, `Sound/${key}`, `${soundName} → ${path}`)
    } else {
      line(FAIL, `Sound/${key}`, `${soundName} — file not found at /System/Library/Sounds/${soundName}.aiff`)
    }
  }

  line(OK, "Cooldown", `${config.cooldownSeconds}s between notifications per tool`)
  console.log("")
}
