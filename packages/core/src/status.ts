import type { NotifyBackend, NotifySkipReason, NotifyTrigger } from "./types.js"
import { loadConfigResult, type ConfigLoadStatus, type ConfigValidationIssue } from "./config.js"
import { cooldownFilePath, getCooldownState } from "./cooldown.js"
import { resolveTerminal, isTerminalFocused } from "./focus.js"
import type { ResolvedTerminal } from "./terminal.js"
import { isZellijSession, isPaneTabActive } from "./zellij.js"
import { detectMacOSBackend } from "./platform/index.js"
import { isQuietHour } from "./notify.js"

export interface EventDeliveryStatus {
  enabled: boolean
  wouldSend: boolean
  reason?: NotifySkipReason
}

export interface FocusInspection {
  terminal: ResolvedTerminal | null
  terminalApp: string | null
  terminalFocused: boolean
  zellijSession: boolean
  activeTabVisible: boolean | null
  suppressesNotifications: boolean
}

export interface QuietHoursInspection {
  configured: boolean
  active: boolean
}

export interface CooldownInspection {
  tool: string
  file: string
  active: boolean
  remainingSeconds: number
}

export interface StatusInspection {
  configStatus: ConfigLoadStatus
  configPath: string
  configIssues: ConfigValidationIssue[]
  backend: NotifyBackend | null
  focus: FocusInspection
  quietHours: QuietHoursInspection
  cooldown: CooldownInspection
  events: Record<NotifyTrigger, EventDeliveryStatus>
}

function platformBackend(): NotifyBackend | null {
  if (process.platform === "linux") return "notify-send"
  if (process.platform === "win32") return "powershell"
  return null
}

export async function inspectStatus(options: { tool?: string } = {}): Promise<StatusInspection> {
  const tool = options.tool ?? "cli"
  const configResult = await loadConfigResult()
  const config = configResult.config

  const backend = process.platform === "darwin"
    ? await detectMacOSBackend(config.backend)
    : platformBackend()

  const terminal = resolveTerminal({
    configOverride: config.terminalApp,
    env: process.env,
    termProgram: process.env.TERM_PROGRAM ?? "",
  })
  const terminalApp = terminal?.displayName ?? null
  const zellijSession = isZellijSession()
  const terminalFocused = terminalApp !== null ? await isTerminalFocused(terminalApp) : false
  let activeTabVisible: boolean | null = null
  let suppressesNotifications = false

  if (terminalApp !== null && terminalFocused) {
    if (zellijSession) {
      activeTabVisible = await isPaneTabActive()
      suppressesNotifications = activeTabVisible
    } else {
      suppressesNotifications = true
    }
  }

  const cooldownFile = cooldownFilePath(tool)
  const cooldown = await getCooldownState(cooldownFile, config.cooldownSeconds)
  const quietHoursActive = isQuietHour(config.quietHours)

  const eventDecision = (trigger: NotifyTrigger): EventDeliveryStatus => {
    if (!config.events[trigger]) {
      return { enabled: false, wouldSend: false, reason: "event-disabled" }
    }

    if (suppressesNotifications) {
      return { enabled: true, wouldSend: false, reason: "terminal-focused" }
    }

    if (cooldown.active) {
      return { enabled: true, wouldSend: false, reason: "cooldown" }
    }

    return { enabled: true, wouldSend: true }
  }

  return {
    configStatus: configResult.status,
    configPath: configResult.path,
    configIssues: configResult.issues,
    backend,
    focus: {
      terminal,
      terminalApp,
      terminalFocused,
      zellijSession,
      activeTabVisible,
      suppressesNotifications,
    },
    quietHours: {
      configured: config.quietHours !== null,
      active: quietHoursActive,
    },
    cooldown: {
      tool,
      file: cooldownFile,
      active: cooldown.active,
      remainingSeconds: cooldown.remainingSeconds,
    },
    events: {
      done: eventDecision("done"),
      question: eventDecision("question"),
      permission: eventDecision("permission"),
    },
  }
}
