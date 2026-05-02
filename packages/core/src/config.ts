import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import type { Config, NotifyBackend } from "./types.js"

export type ConfigLoadStatus = "ok" | "missing" | "invalid-json" | "invalid-fields"

export interface ConfigValidationIssue {
  path: string
  message: string
}

export interface LoadConfigResult {
  path: string
  status: ConfigLoadStatus
  config: Config
  issues: ConfigValidationIssue[]
}

const VALID_BACKENDS: NotifyBackend[] = ["macos-helper", "osascript", "notify-send", "powershell"]

export const defaultConfig: Config = {
  cooldownSeconds: 3,
  quietHours:      { start: 22, end: 8 },
  sounds:          { done: "Morse", question: "Submarine", permission: null },
  events:          { done: true, question: true, permission: true },
  terminalApp:     null,
  backend:         null,
  clickRestore:    { enabled: false },
  zellij: {
    tabIndicator: {
      enabled: true,
      prefix: " ● ",
    },
    paneIndicator: {
      enabled: false,
      mode: "background",
      bg: "#3c3836",
      clearOn: "origin-pane-focus",
    },
  },
}

export const defaultConfigPath = join(
  homedir(),
  ".config",
  "agent-notify",
  "config.json",
)

function cloneDefaultConfig(): Config {
  return structuredClone(defaultConfig)
}

function issue(path: string, message: string): ConfigValidationIssue {
  return { path, message }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return Number.isInteger(value) && Number(value) >= min && Number(value) <= max
}

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)
}

function validateConfig(raw: unknown): { config: Config; issues: ConfigValidationIssue[] } {
  const config = cloneDefaultConfig()
  const issues: ConfigValidationIssue[] = []

  if (!isRecord(raw)) {
    return {
      config,
      issues: [issue("$", "Expected config to be a JSON object")],
    }
  }

  if ("cooldownSeconds" in raw) {
    const value = raw.cooldownSeconds
    if (Number.isInteger(value) && Number(value) >= 0) {
      config.cooldownSeconds = Number(value)
    } else {
      issues.push(issue("cooldownSeconds", "Expected a non-negative integer"))
    }
  }

  if ("quietHours" in raw) {
    const value = raw.quietHours
    if (value === null) {
      config.quietHours = null
    } else if (isRecord(value)) {
      const startValid = isIntegerInRange(value.start, 0, 23)
      const endValid = isIntegerInRange(value.end, 0, 23)

      if (startValid && endValid) {
        config.quietHours = { start: Number(value.start), end: Number(value.end) }
      } else {
        if (!startValid) issues.push(issue("quietHours.start", "Expected an integer between 0 and 23"))
        if (!endValid) issues.push(issue("quietHours.end", "Expected an integer between 0 and 23"))
      }
    } else {
      issues.push(issue("quietHours", "Expected an object with start/end or null"))
    }
  }

  if ("sounds" in raw) {
    const value = raw.sounds
    if (isRecord(value)) {
      for (const key of ["done", "question", "permission"] as const) {
        if (!(key in value)) continue
        const soundValue = value[key]
        if (typeof soundValue === "string" || soundValue === null) {
          config.sounds[key] = soundValue
        } else {
          issues.push(issue(`sounds.${key}`, "Expected a string or null"))
        }
      }
    } else {
      issues.push(issue("sounds", "Expected an object"))
    }
  }

  if ("events" in raw) {
    const value = raw.events
    if (isRecord(value)) {
      for (const key of ["done", "question", "permission"] as const) {
        if (!(key in value)) continue
        const eventValue = value[key]
        if (typeof eventValue === "boolean") {
          config.events[key] = eventValue
        } else {
          issues.push(issue(`events.${key}`, "Expected a boolean"))
        }
      }
    } else {
      issues.push(issue("events", "Expected an object"))
    }
  }

  if ("terminalApp" in raw) {
    const value = raw.terminalApp
    if (typeof value === "string" || value === null) {
      config.terminalApp = value
    } else {
      issues.push(issue("terminalApp", "Expected a string or null"))
    }
  }

  if ("backend" in raw) {
    const value = raw.backend
    if (value === null || (typeof value === "string" && VALID_BACKENDS.includes(value as NotifyBackend))) {
      config.backend = value as NotifyBackend | null
    } else {
      issues.push(issue("backend", `Expected one of ${VALID_BACKENDS.join(", ")} or null`))
    }
  }

  if ("clickRestore" in raw) {
    const value = raw.clickRestore
    if (isRecord(value)) {
      if ("enabled" in value) {
        if (typeof value.enabled === "boolean") {
          config.clickRestore.enabled = value.enabled
        } else {
          issues.push(issue("clickRestore.enabled", "Expected a boolean"))
        }
      }
    } else {
      issues.push(issue("clickRestore", "Expected an object"))
    }
  }

  if ("zellij" in raw) {
    const value = raw.zellij
    if (isRecord(value)) {
      if ("tabIndicator" in value) {
        const tabIndicator = value.tabIndicator
        if (isRecord(tabIndicator)) {
          if ("enabled" in tabIndicator) {
            if (typeof tabIndicator.enabled === "boolean") {
              config.zellij.tabIndicator.enabled = tabIndicator.enabled
            } else {
              issues.push(issue("zellij.tabIndicator.enabled", "Expected a boolean"))
            }
          }
          if ("prefix" in tabIndicator) {
            if (typeof tabIndicator.prefix === "string") {
              config.zellij.tabIndicator.prefix = tabIndicator.prefix
            } else {
              issues.push(issue("zellij.tabIndicator.prefix", "Expected a string"))
            }
          }
        } else {
          issues.push(issue("zellij.tabIndicator", "Expected an object"))
        }
      }

      if ("paneIndicator" in value) {
        const paneIndicator = value.paneIndicator
        if (isRecord(paneIndicator)) {
          if ("enabled" in paneIndicator) {
            if (typeof paneIndicator.enabled === "boolean") {
              config.zellij.paneIndicator.enabled = paneIndicator.enabled
            } else {
              issues.push(issue("zellij.paneIndicator.enabled", "Expected a boolean"))
            }
          }
          if ("mode" in paneIndicator) {
            if (paneIndicator.mode === "background") {
              config.zellij.paneIndicator.mode = "background"
            } else {
              issues.push(issue("zellij.paneIndicator.mode", 'Expected "background"'))
            }
          }
          if ("bg" in paneIndicator) {
            if (paneIndicator.bg === null || isHexColor(paneIndicator.bg)) {
              config.zellij.paneIndicator.bg = paneIndicator.bg
            } else {
              issues.push(issue("zellij.paneIndicator.bg", "Expected a hex color like #32302f or null"))
            }
          }
          if ("clearOn" in paneIndicator) {
            if (paneIndicator.clearOn === "origin-pane-focus") {
              config.zellij.paneIndicator.clearOn = "origin-pane-focus"
            } else {
              issues.push(issue("zellij.paneIndicator.clearOn", 'Expected "origin-pane-focus"'))
            }
          }
        } else {
          issues.push(issue("zellij.paneIndicator", "Expected an object"))
        }
      }
    } else {
      issues.push(issue("zellij", "Expected an object"))
    }
  }

  return { config, issues }
}

function getJsonErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function loadConfigResult(path = defaultConfigPath): Promise<LoadConfigResult> {
  const fallback = cloneDefaultConfig()

  try {
    const raw = await readFile(path, "utf8")

    try {
      const parsed = JSON.parse(raw) as unknown
      const validated = validateConfig(parsed)

      return {
        path,
        status: validated.issues.length > 0 ? "invalid-fields" : "ok",
        config: validated.config,
        issues: validated.issues,
      }
    } catch (error) {
      return {
        path,
        status: "invalid-json",
        config: fallback,
        issues: [issue("$", `Invalid JSON: ${getJsonErrorMessage(error)}`)],
      }
    }
  } catch {
    return {
      path,
      status: "missing",
      config: fallback,
      issues: [],
    }
  }
}

export async function loadConfig(path = defaultConfigPath): Promise<Config> {
  const result = await loadConfigResult(path)
  return result.config
}
