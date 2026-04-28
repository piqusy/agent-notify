import { afterEach, describe, expect, it, vi } from "vitest"

const coreMock = vi.hoisted(() => ({
  defaultConfigPath: "/tmp/agent-notify-test-config.json",
  loadConfigResult: vi.fn(async () => ({
    path: "/tmp/agent-notify-test-config.json",
    status: "invalid-fields",
    config: {
      cooldownSeconds: 3,
      quietHours: null,
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
    issues: [
      { path: "quietHours.start", message: "Expected an integer between 0 and 23" },
      { path: "backend", message: "Expected one of macos-helper, osascript, notify-send, powershell or null" },
    ],
  })),
  resolveTerminalApp: vi.fn(() => null),
  isTerminalFocused: vi.fn(async () => false),
  isQuietHour: vi.fn(() => false),
  detectMacOSBackend: vi.fn(async () => "notify-send"),
  findMacOSHelperApp: vi.fn(() => null),
  findMacOSHelperBinary: vi.fn(() => null),
  BUILTIN_SOUNDS: ["Morse", "Submarine"],
}))

vi.mock("@agent-notify/core", () => coreMock)
vi.mock("node:child_process", () => ({
  execSync: vi.fn(() => {
    throw new Error("no sw_vers")
  }),
  execFileSync: vi.fn(() => "denied"),
}))

import { cmdDoctor } from "../commands/doctor.js"

describe("cmdDoctor", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    coreMock.loadConfigResult.mockClear()
  })

  it("prints invalid config issues clearly", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined)

    await cmdDoctor()

    expect(coreMock.loadConfigResult).toHaveBeenCalledOnce()
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("invalid settings reset to defaults"))
    expect(logSpy).toHaveBeenCalledWith("                    - quietHours.start: Expected an integer between 0 and 23")
    expect(logSpy).toHaveBeenCalledWith("                    - backend: Expected one of macos-helper, osascript, notify-send, powershell or null")
  })
})
