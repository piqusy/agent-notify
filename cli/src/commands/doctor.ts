import { execSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import {
  defaultConfigPath,
  loadConfig,
  resolveTerminalApp,
  isTerminalFocused,
  isQuietHour,
  detectMacOSBackend,
  BUILTIN_SOUNDS,
} from "@agent-notify/core"
import type { Config } from "@agent-notify/core"

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

function checkTerminalNotifierInstalled(): string | null {
  const paths = [
    "/opt/homebrew/bin/terminal-notifier",
    "/usr/local/bin/terminal-notifier",
  ]
  for (const p of paths) {
    if (existsSync(p)) return p
  }
  return null
}

/**
 * Reads macOS notification center preferences and checks whether
 * terminal-notifier has notifications enabled.
 *
 * Returns: true = enabled, false = disabled, null = can't determine.
 */
function checkNotificationPermission(): { enabled: boolean | null; detail: string } {
  if (process.platform !== "darwin") {
    return { enabled: null, detail: "Not macOS — skipped" }
  }

  try {
    const raw = execSync("defaults read com.apple.ncprefs apps", {
      encoding: "utf8",
      timeout: 5000,
    })

    // Look for terminal-notifier bundle ID in the plist output
    const bundleIds = [
      "fr.julienxx.oss.terminal-notifier",
      "nl.superalloy.oss.terminal-notifier",
    ]

    for (const bundleId of bundleIds) {
      const idx = raw.indexOf(bundleId)
      if (idx === -1) continue

      // The plist entry looks like:
      //   "bundle-id" = "...terminal-notifier";
      //   flags = <top-level, layout varies by macOS version>;
      //   src = (
      //       {
      //       flags = 1;   ← bit 0 here reliably means "notifications enabled"
      //       ...
      //       }
      //   );
      // We target the flags inside the src block, not the top-level flags,
      // because the top-level flags bitmask layout is undocumented and changes
      // across macOS versions.
      const chunk = raw.slice(idx, idx + 800)
      const srcBlockMatch = chunk.match(/\bsrc\s*=\s*\([\s\S]*?flags\s*=\s*(\d+)/)
      if (!srcBlockMatch) {
        // Fallback: no src block found — entry exists but state is unknown
        return { enabled: null, detail: `terminal-notifier found but permission state unclear (bundle: ${bundleId})` }
      }

      const flags = parseInt(srcBlockMatch[1], 10)
      // Bit 0 of src[].flags: 1 = notifications enabled
      const enabled = (flags & 1) === 1
      return {
        enabled,
        detail: enabled
          ? `Notifications allowed (bundle: ${bundleId})`
          : `Notifications DISABLED (bundle: ${bundleId})`,
      }
    }

    return { enabled: null, detail: "terminal-notifier not found in Notification Center prefs" }
  } catch {
    return { enabled: null, detail: "Could not read notification preferences" }
  }
}

function checkSoundFile(soundName: string | null): { found: boolean; path: string | null } {
  if (!soundName) return { found: true, path: null } // null = silent, which is valid
  const p = `/System/Library/Sounds/${soundName}.aiff`
  return { found: existsSync(p), path: p }
}

export async function cmdDoctor(): Promise<void> {
  console.log("agent-notify doctor")
  console.log("====================\n")

  // 1. Config
  const configExists = existsSync(defaultConfigPath)
  let config: Config | null = null
  if (configExists) {
    try {
      const raw = readFileSync(defaultConfigPath, "utf8")
      JSON.parse(raw) // validate JSON
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

  // 2. macOS version
  const macVer = getMacOSVersion()
  if (macVer) {
    if (macVer.startsWith("15.")) {
      line(WARN, "macOS", `${macVer} (Sequoia) — some notification APIs restricted`)
    } else {
      line(OK, "macOS", macVer)
    }
  } else {
    line(OK, "Platform", process.platform)
  }

  // 3. Backend detection
  if (process.platform === "darwin") {
    // Suppress the Sequoia stderr warning from detectMacOSBackend — we already report macOS version above
    const origStderrWrite = process.stderr.write
    process.stderr.write = (() => true) as typeof process.stderr.write
    const backend = await detectMacOSBackend(config.backend)
    process.stderr.write = origStderrWrite
    const tnPath = checkTerminalNotifierInstalled()
    if (config.backend) {
      line(OK, "Backend", `${backend} (explicit override)`)
    } else if (tnPath) {
      line(OK, "Backend", `${backend} (auto-detected at ${tnPath})`)
    } else {
      line(WARN, "Backend", `${backend} (terminal-notifier not installed — consider: brew install terminal-notifier)`)
    }

    // 4. Notification permissions (only relevant for terminal-notifier)
    if (backend === "terminal-notifier") {
      const perms = checkNotificationPermission()
      if (perms.enabled === true) {
        line(OK, "Permissions", perms.detail)
      } else if (perms.enabled === false) {
        line(FAIL, "Permissions", perms.detail)
        console.log("                    → Open System Settings > Notifications > terminal-notifier > Allow Notifications")
      } else {
        line(WARN, "Permissions", perms.detail)
      }
    }
  }

  // 5. Focus detection
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

  // 6. Quiet hours
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

  // 7. Events
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

  // 8. Sounds
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
    const { found, path } = checkSoundFile(soundName)
    if (found) {
      line(OK, `Sound/${key}`, `${soundName} → ${path}`)
    } else {
      line(FAIL, `Sound/${key}`, `${soundName} — file not found at /System/Library/Sounds/${soundName}.aiff`)
    }
  }

  // 9. Cooldown
  line(OK, "Cooldown", `${config.cooldownSeconds}s between notifications per tool`)

  console.log("")
}
