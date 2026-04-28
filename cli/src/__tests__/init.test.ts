import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Config } from "@agent-notify/core"

const mockState = vi.hoisted(() => ({
  defaultConfig: {
    cooldownSeconds: 3,
    quietHours: { start: 22, end: 8 },
    sounds: { done: "Morse", question: "Submarine", permission: null },
    events: { done: true, question: true, permission: true },
    terminalApp: null,
    backend: null,
    clickRestore: { enabled: false },
    zellij: {
      tabIndicator: { enabled: true, prefix: " ● " },
      paneIndicator: { enabled: false, mode: "background", bg: "#3c3836", clearOn: "origin-pane-focus" },
    },
  },
  loadConfig: vi.fn(),
  notify: vi.fn(async () => undefined),
  resolveTerminalApp: vi.fn((term: string) => ({ ghostty: "Ghostty", kitty: "Kitty", wezterm: "WezTerm" }[term] ?? null)),
  selectConfigs: [] as Array<Record<string, unknown>>,
  inputConfigs: [] as Array<Record<string, unknown>>,
  confirmConfigs: [] as Array<Record<string, unknown>>,
  checkboxConfigs: [] as Array<Record<string, unknown>>,
  playSound: vi.fn(),
}))

vi.mock("node:child_process", () => ({
  execSync: vi.fn(() => "14.0\n"),
}))

vi.mock("@agent-notify/core", () => ({
  BUILTIN_SOUNDS: ["Morse", "Submarine", "Glass"],
  defaultConfig: mockState.defaultConfig,
  defaultConfigPath: "/tmp/agent-notify-test-config.json",
  loadConfig: mockState.loadConfig,
  notify: mockState.notify,
  TERM_PROGRAM_MAP: { ghostty: "Ghostty", kitty: "Kitty", wezterm: "WezTerm" },
  resolveTerminalApp: mockState.resolveTerminalApp,
}))

vi.mock("../prompts/cancel.js", () => ({
  ask: vi.fn(async (promise: Promise<unknown>) => promise),
}))

vi.mock("../prompts/select-with-preview.js", () => ({
  selectWithPreview: vi.fn((config: { default?: unknown; choices: Array<{ value: unknown }> }) => {
    mockState.selectConfigs.push(config as Record<string, unknown>)
    return Promise.resolve(config.default ?? config.choices[0]?.value)
  }),
}))

vi.mock("../prompts/confirm.js", () => ({
  confirm: vi.fn((config: { message: string; default?: boolean }) => {
    mockState.confirmConfigs.push(config as Record<string, unknown>)
    if (config.message === "Send a test notification now?") {
      return Promise.resolve(false)
    }
    return Promise.resolve(config.default ?? true)
  }),
}))

vi.mock("../prompts/input.js", () => ({
  input: vi.fn((config: { default?: string }) => {
    mockState.inputConfigs.push(config as Record<string, unknown>)
    return Promise.resolve(config.default ?? "")
  }),
}))

vi.mock("../prompts/checkbox.js", () => ({
  checkbox: vi.fn((config: { choices: Array<string | { value: string; checked?: boolean }> }) => {
    mockState.checkboxConfigs.push(config as Record<string, unknown>)
    const selected = config.choices.flatMap((choice) => {
      if (typeof choice === "string") return []
      return choice.checked ? [choice.value] : []
    })
    return Promise.resolve(selected)
  }),
}))

vi.mock("../sounds/play.js", () => ({
  playSound: mockState.playSound,
}))

import { cmdInit } from "../commands/init.js"

describe("cmdInit", () => {
  const originalPlatform = process.platform
  const originalTermProgram = process.env.TERM_PROGRAM
  const originalZellij = process.env.ZELLIJ
  const tempDirs: string[] = []

  beforeEach(() => {
    mockState.selectConfigs.length = 0
    mockState.inputConfigs.length = 0
    mockState.confirmConfigs.length = 0
    mockState.checkboxConfigs.length = 0
    mockState.loadConfig.mockReset()
    mockState.notify.mockClear()
    mockState.resolveTerminalApp.mockClear()
    mockState.playSound.mockClear()
    vi.spyOn(console, "log").mockImplementation(() => undefined)
  })

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true })
    process.env.TERM_PROGRAM = originalTermProgram
    process.env.ZELLIJ = originalZellij
    vi.restoreAllMocks()
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("prepopulates the wizard from the existing config and writes it back unchanged", async () => {
    const root = mkdtempSync(join(tmpdir(), "agent-notify-init-"))
    tempDirs.push(root)
    const configPath = join(root, "config.json")

    const existingConfig: Config = {
      cooldownSeconds: 17,
      quietHours: { start: 1, end: 9 },
      sounds: { done: "Glass", question: null, permission: "Morse" },
      events: { done: true, question: false, permission: true },
      terminalApp: "Warp Terminal",
      backend: "notify-send",
      clickRestore: { enabled: true },
      zellij: {
        tabIndicator: { enabled: true, prefix: " ● " },
        paneIndicator: { enabled: true, mode: "background", bg: "#123456", clearOn: "origin-pane-focus" },
      },
    }

    Object.defineProperty(process, "platform", { value: "darwin", configurable: true })
    process.env.TERM_PROGRAM = "ghostty"
    process.env.ZELLIJ = "1"

    await cmdInit({
      configPath,
      existingConfig,
    })

    const writtenConfig = JSON.parse(readFileSync(configPath, "utf8"))
    expect(writtenConfig).toEqual(existingConfig)

    expect(mockState.selectConfigs.find((config) => config.message === "Notification backend")?.default).toBe("notify-send")
    expect(mockState.selectConfigs.find((config) => config.message === "Terminal app for focus detection")?.default).toBe("__custom__")
    expect(mockState.inputConfigs.find((config) => config.message === "Terminal app name (as shown in macOS Activity Monitor)")?.default).toBe("Warp Terminal")
    expect(mockState.confirmConfigs.find((config) => config.message === "Enable quiet hours (mute sounds at night)?")?.default).toBe(true)
    expect(mockState.inputConfigs.find((config) => config.message === "Quiet hours start (0–23)")?.default).toBe("1")
    expect(mockState.inputConfigs.find((config) => config.message === "Quiet hours end (0–23)")?.default).toBe("9")
    expect(mockState.selectConfigs.find((config) => config.message === "Sound for 'done' notifications")?.default).toBe("Glass")
    expect(mockState.selectConfigs.find((config) => config.message === "Sound for 'question' notifications")?.default).toBe(null)
    expect(mockState.selectConfigs.find((config) => config.message === "Sound for 'permission' notifications")?.default).toBe("Morse")
    expect(mockState.checkboxConfigs.find((config) => config.message === "Which events should trigger notifications?")?.choices).toEqual([
      { name: "Done (agent finished work)", value: "done", checked: true },
      { name: "Question (agent waiting for input)", value: "question", checked: false },
      { name: "Permission (agent requesting permission)", value: "permission", checked: true },
    ])
    expect(mockState.inputConfigs.find((config) => config.message === "Cooldown between notifications (seconds)")?.default).toBe("17")
    expect(mockState.confirmConfigs.find((config) => config.message === "Enable click-to-restore on macOS notifications?")?.default).toBe(true)
    expect(mockState.selectConfigs.find((config) => config.message === "Zellij visual indicators for background notifications")?.default).toBe("tab-and-pane")
    expect(mockState.selectConfigs.find((config) => config.message === "Pane tint color")?.default).toBe("__custom__")
    expect(mockState.inputConfigs.find((config) => config.message === "Pane background hex color")?.default).toBe("#123456")
    expect(mockState.notify).not.toHaveBeenCalled()
  })
})
