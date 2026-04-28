import { execSync } from "node:child_process"
import * as fs from "node:fs"
import * as path from "node:path"
import {
  BUILTIN_SOUNDS,
  defaultConfig,
  defaultConfigPath,
  loadConfig,
  notify,
  TERM_PROGRAM_MAP,
  resolveTerminalApp,
} from "@agent-notify/core"
import type { Config, NotifyBackend } from "@agent-notify/core"
import { ask } from "../prompts/cancel.js"
import { selectWithPreview } from "../prompts/select-with-preview.js"
import { checkbox } from "../prompts/checkbox.js"
import { confirm } from "../prompts/confirm.js"
import { input } from "../prompts/input.js"
import { playSound } from "../sounds/play.js"

const CUSTOM_CHOICE = "__custom__"

type EventName = "done" | "question" | "permission"

type SelectChoiceValue = string | null

export interface CmdInitOptions {
  configPath?: string
  existingConfig?: Config
}

const SOUND_CHOICES = [
  { name: "None (silent)", value: null as string | null },
  ...BUILTIN_SOUNDS.map((s) => ({ name: s, value: s as string | null })),
]

const TERMINAL_CHOICES: Array<{ name: string; value: SelectChoiceValue }> = [
  { name: "Auto-detect from $TERM_PROGRAM", value: null },
  ...(Object.values(TERM_PROGRAM_MAP) as string[]).map((app) => ({ name: app, value: app as string | null })),
  { name: "Other (type manually)", value: CUSTOM_CHOICE },
]

const BACKEND_CHOICES: Array<{ name: string; value: NotifyBackend | null }> = [
  { name: "Auto-detect (recommended)", value: null },
  { name: "macos-helper (native app, recommended on modern macOS)", value: "macos-helper" },
  { name: "osascript (macOS built-in fallback)", value: "osascript" },
  { name: "notify-send (Linux)", value: "notify-send" },
  { name: "PowerShell / BurntToast (Windows)", value: "powershell" },
]

const ZELLIJ_MODE_CHOICES = [
  { name: "Tab indicator only (recommended)", value: "tab-only" },
  { name: "Tab indicator + pane tint", value: "tab-and-pane" },
  { name: "Disable Zellij indicators", value: "disabled" },
] as const

const ZELLIJ_PANE_BG_CHOICES = [
  { name: "Subtle neutral (#32302f)", value: "#32302f" },
  { name: "Stronger neutral (#3c3836)", value: "#3c3836" },
  { name: "Warm brown (#3a332b)", value: "#3a332b" },
  { name: "Custom hex", value: CUSTOM_CHOICE },
] as const

function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value)
}

export function getTerminalChoices(detectedTerminal: string | null): Array<{ name: string; value: SelectChoiceValue }> {
  if (!detectedTerminal) return TERMINAL_CHOICES

  return [
    { name: `Auto-detect: ${detectedTerminal} (current)`, value: null },
    ...TERMINAL_CHOICES.slice(1),
  ]
}

export function getTerminalChoiceDefault(
  existingTerminalApp: string | null,
  choices: Array<{ name: string; value: SelectChoiceValue }>,
): SelectChoiceValue {
  if (existingTerminalApp === null) return null
  if (choices.some((choice) => choice.value === existingTerminalApp)) return existingTerminalApp
  return CUSTOM_CHOICE
}

export function getEnabledEventDefaults(config: Config): EventName[] {
  const enabled: EventName[] = []

  if (config.events.done) enabled.push("done")
  if (config.events.question) enabled.push("question")
  if (config.events.permission) enabled.push("permission")

  return enabled
}

function zellijModeFromConfig(config: Config): (typeof ZELLIJ_MODE_CHOICES)[number]["value"] {
  if (!config.zellij.tabIndicator.enabled) return "disabled"
  if (config.zellij.paneIndicator.enabled) return "tab-and-pane"
  return "tab-only"
}

function shouldAskForZellijConfig(config: Config): boolean {
  if (process.env.ZELLIJ !== undefined) return true

  return JSON.stringify(config.zellij) !== JSON.stringify(defaultConfig.zellij)
}

function detectMacOSVersion(): string | null {
  try {
    return execSync("sw_vers -productVersion", { encoding: "utf8" }).trim()
  } catch {
    return null
  }
}

export async function cmdInit(options: CmdInitOptions = {}): Promise<void> {
  const configPath = options.configPath ?? defaultConfigPath
  const existingConfig = options.existingConfig ?? await loadConfig(configPath)

  console.log("agent-notify setup wizard")
  console.log("=========================\n")

  const macVersion = detectMacOSVersion()
  if (macVersion) {
    console.log(`macOS ${macVersion} detected.`)
    console.log("  Native helper backend is the supported macOS path. osascript is kept only as a fallback.\n")
  }

  const backend = await ask(selectWithPreview<NotifyBackend | null>({
    message: "Notification backend",
    choices: BACKEND_CHOICES,
    default: existingConfig.backend,
  }))

  const detectedTerminal = process.env.TERM_PROGRAM
    ? (TERM_PROGRAM_MAP[process.env.TERM_PROGRAM] ?? null)
    : null
  const terminalChoices = getTerminalChoices(detectedTerminal)
  const terminalChoiceDefault = getTerminalChoiceDefault(existingConfig.terminalApp, terminalChoices)

  let terminalApp: string | null = null
  const terminalChoice = await ask(selectWithPreview<string | null>({
    message: "Terminal app for focus detection",
    choices: terminalChoices,
    default: terminalChoiceDefault,
  }))

  if (terminalChoice === CUSTOM_CHOICE) {
    const custom = await ask(input({
      message: "Terminal app name (as shown in macOS Activity Monitor)",
      default: existingConfig.terminalApp ?? "",
      validate: (v) => v.trim().length > 0 || "Required",
    }))
    terminalApp = custom.trim()
  } else {
    terminalApp = terminalChoice
  }

  const quietHoursEnabled = await ask(confirm({
    message: "Enable quiet hours (mute sounds at night)?",
    default: existingConfig.quietHours !== null,
  }))

  const defaultQuietHours = existingConfig.quietHours ?? defaultConfig.quietHours ?? { start: 22, end: 8 }
  let quietHours: typeof defaultConfig.quietHours | null = defaultQuietHours
  if (quietHoursEnabled) {
    const startStr = await ask(input({
      message: "Quiet hours start (0–23)",
      default: String(defaultQuietHours.start),
      validate: (v) => {
        const n = parseInt(v, 10)
        return (!isNaN(n) && n >= 0 && n <= 23) || "Enter a number 0–23"
      },
    }))
    const endStr = await ask(input({
      message: "Quiet hours end (0–23)",
      default: String(defaultQuietHours.end),
      validate: (v) => {
        const n = parseInt(v, 10)
        return (!isNaN(n) && n >= 0 && n <= 23) || "Enter a number 0–23"
      },
    }))
    quietHours = { start: parseInt(startStr, 10), end: parseInt(endStr, 10) }
  } else {
    quietHours = null
  }

  const soundDone = await ask(selectWithPreview<string | null>({
    message: "Sound for 'done' notifications",
    choices: SOUND_CHOICES,
    default: existingConfig.sounds.done,
    onPreview: (v) => { if (v) playSound(v) },
  }))

  const soundQuestion = await ask(selectWithPreview<string | null>({
    message: "Sound for 'question' notifications",
    choices: SOUND_CHOICES,
    default: existingConfig.sounds.question,
    onPreview: (v) => { if (v) playSound(v) },
  }))

  const soundPermission = await ask(selectWithPreview<string | null>({
    message: "Sound for 'permission' notifications",
    choices: [
      { name: "Same as question (default)", value: null as string | null },
      ...BUILTIN_SOUNDS.map((s) => ({ name: s, value: s as string | null })),
    ],
    default: existingConfig.sounds.permission,
    onPreview: (v) => { if (v) playSound(v) },
  }))

  const enabledEvents = await ask(checkbox<EventName>({
    message: "Which events should trigger notifications?",
    choices: [
      { name: "Done (agent finished work)", value: "done", checked: existingConfig.events.done },
      { name: "Question (agent waiting for input)", value: "question", checked: existingConfig.events.question },
      { name: "Permission (agent requesting permission)", value: "permission", checked: existingConfig.events.permission },
    ],
  }))

  const cooldownStr = await ask(input({
    message: "Cooldown between notifications (seconds)",
    default: String(existingConfig.cooldownSeconds),
    validate: (v) => {
      const n = parseInt(v, 10)
      return (!isNaN(n) && n >= 0) || "Enter a non-negative integer"
    },
  }))

  let clickRestore = existingConfig.clickRestore
  if (process.platform === "darwin") {
    const enabled = await ask(confirm({
      message: "Enable click-to-restore on macOS notifications?",
      default: existingConfig.clickRestore.enabled,
    }))
    clickRestore = { enabled }
  }

  let zellij = existingConfig.zellij
  if (shouldAskForZellijConfig(existingConfig)) {
    const zellijMode = await ask(selectWithPreview<(typeof ZELLIJ_MODE_CHOICES)[number]["value"]>({
      message: "Zellij visual indicators for background notifications",
      choices: [...ZELLIJ_MODE_CHOICES],
      default: zellijModeFromConfig(existingConfig),
    }))

    if (zellijMode === "disabled") {
      zellij = {
        tabIndicator: {
          ...existingConfig.zellij.tabIndicator,
          enabled: false,
        },
        paneIndicator: {
          ...existingConfig.zellij.paneIndicator,
          enabled: false,
        },
      }
    } else if (zellijMode === "tab-only") {
      zellij = {
        tabIndicator: {
          ...existingConfig.zellij.tabIndicator,
          enabled: true,
        },
        paneIndicator: {
          ...existingConfig.zellij.paneIndicator,
          enabled: false,
        },
      }
    } else {
      const defaultPaneBg = existingConfig.zellij.paneIndicator.bg ?? defaultConfig.zellij.paneIndicator.bg ?? "#32302f"
      const paneBgChoice = await ask(selectWithPreview<string>({
        message: "Pane tint color",
        choices: ZELLIJ_PANE_BG_CHOICES.map((choice) => ({
          name: choice.name,
          value: choice.value,
        })),
        default: ZELLIJ_PANE_BG_CHOICES.some((choice) => choice.value === defaultPaneBg)
          ? defaultPaneBg
          : CUSTOM_CHOICE,
      }))

      const paneBg = paneBgChoice === CUSTOM_CHOICE
        ? await ask(input({
            message: "Pane background hex color",
            default: defaultPaneBg,
            validate: (value) => isHexColor(value.trim()) || "Enter a hex color like #32302f",
          }))
        : paneBgChoice

      zellij = {
        tabIndicator: {
          ...existingConfig.zellij.tabIndicator,
          enabled: true,
        },
        paneIndicator: {
          ...existingConfig.zellij.paneIndicator,
          enabled: true,
          bg: paneBg.trim(),
        },
      }
    }
  }

  const config: Config = {
    cooldownSeconds: parseInt(cooldownStr, 10),
    quietHours,
    sounds: { done: soundDone, question: soundQuestion, permission: soundPermission },
    events: {
      done: enabledEvents.includes("done"),
      question: enabledEvents.includes("question"),
      permission: enabledEvents.includes("permission"),
    },
    terminalApp,
    backend,
    clickRestore,
    zellij,
  }

  console.log("\nConfig to be written:")
  console.log(JSON.stringify(config, null, 2))

  const hints: string[] = []
  if (config.terminalApp === null) {
    const resolved = resolveTerminalApp(process.env.TERM_PROGRAM ?? "")
    if (resolved) hints.push(`  terminalApp: null → will auto-detect as "${resolved}" at runtime`)
  }
  if (config.quietHours === null) {
    hints.push("  quietHours: null → quiet hours disabled, sounds play at all times")
  }
  if (process.platform === "darwin") {
    hints.push("  macOS uses the bundled native helper app icon")
    if (config.clickRestore.enabled) {
      hints.push("  clickRestore.enabled: true → clicking macOS notifications can restore your terminal and Zellij tab")
    }
  }
  if (hints.length > 0) console.log(hints.join("\n"))

  const proceed = await ask(confirm({ message: "Write config?", default: true }))
  if (!proceed) {
    console.log("Aborted.")
    return
  }

  const dir = path.dirname(configPath)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf8")
  console.log(`\nConfig written to ${configPath}`)

  const sendTest = await ask(confirm({
    message: "Send a test notification now?",
    default: true,
  }))
  if (sendTest) {
    const state = await ask(selectWithPreview<"done" | "question">({
      message: "Which type?",
      choices: [
        { name: "Done", value: "done" },
        { name: "Question", value: "question" },
      ],
      default: "done",
    }))
    await notify({ state, tool: "agent-notify-setup", cwd: process.cwd(), skipFocusCheck: true })
    console.log("Test notification sent. If it didn't appear, run: agent-notify doctor")
  }

  console.log("\nSetup complete.")
}
