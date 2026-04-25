import { execSync } from "node:child_process"
import * as fs from "node:fs"
import * as path from "node:path"
import {
  BUILTIN_SOUNDS,
  defaultConfig,
  defaultConfigPath,
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

const SOUND_CHOICES = [
  { name: "None (silent)", value: null as string | null },
  ...BUILTIN_SOUNDS.map((s) => ({ name: s, value: s as string | null })),
]

const TERMINAL_CHOICES: Array<{ name: string; value: string | null }> = [
  { name: "Auto-detect from $TERM_PROGRAM", value: null },
  ...(Object.values(TERM_PROGRAM_MAP) as string[]).map((app) => ({ name: app, value: app as string | null })),
  { name: "Other (type manually)", value: "__custom__" },
]

const BACKEND_CHOICES: Array<{ name: string; value: NotifyBackend | null }> = [
  { name: "Auto-detect (recommended)", value: null },
  { name: "macos-helper (native app, recommended on modern macOS)", value: "macos-helper" },
  { name: "terminal-notifier", value: "terminal-notifier" },
  { name: "osascript (macOS built-in)", value: "osascript" },
  { name: "notify-send (Linux)", value: "notify-send" },
  { name: "PowerShell / BurntToast (Windows)", value: "powershell" },
]

function checkTerminalNotifier(): boolean {
  const paths = [
    "/opt/homebrew/bin/terminal-notifier",
    "/usr/local/bin/terminal-notifier",
  ]
  return paths.some((p) => fs.existsSync(p))
}

function detectMacOSVersion(): string | null {
  try {
    return execSync("sw_vers -productVersion", { encoding: "utf8" }).trim()
  } catch {
    return null
  }
}

export async function cmdInit(): Promise<void> {
  console.log("agent-notify setup wizard")
  console.log("=========================\n")

  // --- macOS note ---
  const macVersion = detectMacOSVersion()
  if (macVersion) {
    console.log(`macOS ${macVersion} detected.`)
    console.log("  Native helper backend is recommended on modern macOS.\n")
  }

  // --- Backend ---
  const backend = await ask(selectWithPreview<NotifyBackend | null>({
    message: "Notification backend",
    choices: BACKEND_CHOICES,
    default: null,
  }))

  // --- Terminal app ---
  const detectedTerminal = process.env.TERM_PROGRAM
    ? (TERM_PROGRAM_MAP[process.env.TERM_PROGRAM] ?? null)
    : null

  let terminalApp: string | null = null
  const terminalChoice = await ask(selectWithPreview<string | null>({
    message: "Terminal app for focus detection",
    choices: detectedTerminal
      ? [
          { name: `Auto-detect: ${detectedTerminal} (current)`, value: null },
          ...TERMINAL_CHOICES.slice(1),
        ]
      : TERMINAL_CHOICES,
    default: null,
  }))

  if (terminalChoice === "__custom__") {
    const custom = await ask(input({
      message: "Terminal app name (as shown in macOS Activity Monitor)",
      validate: (v) => v.trim().length > 0 || "Required",
    }))
    terminalApp = custom.trim()
  } else {
    terminalApp = terminalChoice
  }

  // --- Quiet hours ---
  const quietHoursEnabled = await ask(confirm({
    message: "Enable quiet hours (mute sounds at night)?",
    default: true,
  }))

  const defaultQuietHours = defaultConfig.quietHours ?? { start: 22, end: 8 }
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

  // --- Sounds ---
  const soundDone = await ask(selectWithPreview<string | null>({
    message: "Sound for 'done' notifications",
    choices: SOUND_CHOICES,
    default: defaultConfig.sounds.done,
    onPreview: (v) => { if (v) playSound(v) },
  }))

  const soundQuestion = await ask(selectWithPreview<string | null>({
    message: "Sound for 'question' notifications",
    choices: SOUND_CHOICES,
    default: defaultConfig.sounds.question,
    onPreview: (v) => { if (v) playSound(v) },
  }))

  const soundPermission = await ask(selectWithPreview<string | null>({
    message: "Sound for 'permission' notifications",
    choices: [
      { name: "Same as question (default)", value: null as string | null },
      ...BUILTIN_SOUNDS.map((s) => ({ name: s, value: s as string | null })),
    ],
    default: defaultConfig.sounds.permission,
    onPreview: (v) => { if (v) playSound(v) },
  }))

  // --- Events ---
  const enabledEvents = await ask(checkbox({
    message: "Which events should trigger notifications?",
    choices: [
      { name: "Done (agent finished work)", value: "done", checked: true },
      { name: "Question (agent waiting for input)", value: "question", checked: true },
      { name: "Permission (agent requesting permission)", value: "permission", checked: true },
    ],
  }))

  // --- Cooldown ---
  const cooldownStr = await ask(input({
    message: "Cooldown between notifications (seconds)",
    default: String(defaultConfig.cooldownSeconds),
    validate: (v) => {
      const n = parseInt(v, 10)
      return (!isNaN(n) && n >= 0) || "Enter a non-negative integer"
    },
  }))

  // --- Build config ---
  const config: Config = {
    cooldownSeconds: parseInt(cooldownStr, 10),
    quietHours,
    sounds: { done: soundDone, question: soundQuestion, permission: soundPermission },
    events: {
      done:       enabledEvents.includes("done"),
      question:   enabledEvents.includes("question"),
      permission: enabledEvents.includes("permission"),
    },
    terminalApp,
    backend,
  }

  // --- Review ---
  console.log("\nConfig to be written:")
  console.log(JSON.stringify(config, null, 2))

  // Show helpful hints for null values that will be auto-resolved at runtime
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
  }
  if (hints.length > 0) console.log(hints.join("\n"))

  const proceed = await ask(confirm({ message: "Write config?", default: true }))
  if (!proceed) {
    console.log("Aborted.")
    return
  }

  // --- Write ---
  const dir = path.dirname(defaultConfigPath)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(defaultConfigPath, JSON.stringify(config, null, 2) + "\n", "utf8")
  console.log(`\nConfig written to ${defaultConfigPath}`)

  // --- Test ---
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
